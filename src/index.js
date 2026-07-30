const LINKEDIN_CLIENT_ID = '78dsjq2rbcv26t';
const LINKEDIN_REDIRECT_URI = 'https://nexashare.oattia.workers.dev/api/auth/callback';
const LINKEDIN_SCOPES = 'openid profile email w_member_social';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function setCookie(name, value, maxAge = 86400 * 30) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function handleAuth(request, env) {
  const url = new URL(request.url);

  // LinkedIn OAuth redirect
  if (url.pathname === '/api/auth/linkedin') {
    const teamName = url.searchParams.get('team') || '';
    const state = btoa(JSON.stringify({ team: teamName, ts: Date.now() }));
    const linkedinUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&scope=${encodeURIComponent(LINKEDIN_SCOPES)}&state=${encodeURIComponent(state)}`;
    return Response.redirect(linkedinUrl, 302);
  }

  // OAuth callback
  if (url.pathname === '/api/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error || !code) {
      return Response.redirect('/login.html?error=auth_failed', 302);
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: LINKEDIN_REDIRECT_URI,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: env.LINKEDIN_CLIENT_SECRET || ''
        })
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return Response.redirect('/login.html?error=token_failed', 302);
      }

      // Get user profile from LinkedIn
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const profile = await profileRes.json();

      let stateData = {};
      try { stateData = JSON.parse(atob(state)); } catch(e) {}

      // Find or create team if team name provided
      let teamId = null;
      if (stateData.team) {
        const existingTeam = await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind(stateData.team).first();
        if (existingTeam) {
          teamId = existingTeam.id;
        } else {
          const res = await env.DB.prepare('INSERT INTO teams (name) VALUES (?)').bind(stateData.team).run();
          teamId = res.meta.last_row_id;
        }
      }

      // Find or create user
      const existingUser = await env.DB.prepare('SELECT id, team_id FROM users WHERE linkedin_id = ?').bind(profile.sub).first();
      let userId;
      if (existingUser) {
        userId = existingUser.id;
        if (!existingUser.team_id && teamId) {
          await env.DB.prepare('UPDATE users SET team_id = ?, linkedin_access_token = ? WHERE id = ?').bind(teamId, tokenData.access_token, userId).run();
        } else {
          await env.DB.prepare('UPDATE users SET linkedin_access_token = ? WHERE id = ?').bind(tokenData.access_token, userId).run();
        }
      } else {
        const role = teamId ? 'admin' : 'member';
        const res = await env.DB.prepare(
          'INSERT INTO users (email, name, linkedin_id, linkedin_access_token, team_id, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(profile.email || '', profile.name || '', profile.sub, tokenData.access_token, teamId, role).run();
        userId = res.meta.last_row_id;
      }

      // Create session token (simple approach for POC)
      const sessionToken = btoa(`${userId}:${Date.now()}:${crypto.randomUUID()}`);

      const response = Response.redirect('/dashboard.html', 302);
      return new Response(response.body, {
        status: 302,
        headers: {
          'Location': '/dashboard.html',
          'Set-Cookie': setCookie('session', sessionToken)
        }
      });
    } catch (err) {
      return Response.redirect(`/login.html?error=${encodeURIComponent(err.message)}`, 302);
    }
  }

  return null;
}

async function getUser(request, env) {
  const session = getCookie(request, 'session');
  if (!session) return null;
  try {
    const decoded = atob(session);
    const userId = decoded.split(':')[0];
    return await env.DB.prepare(
      'SELECT u.*, t.name as team_name FROM users u LEFT JOIN teams t ON u.team_id = t.id WHERE u.id = ?'
    ).bind(userId).first();
  } catch(e) {
    return null;
  }
}

async function handleAPI(request, env) {
  const url = new URL(request.url);

  // Auth routes
  const authResponse = await handleAuth(request, env);
  if (authResponse) return authResponse;

  // Get current user
  if (url.pathname === '/api/user') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    return jsonResponse({
      id: user.id, name: user.name, email: user.email,
      role: user.role, team_name: user.team_name, team_id: user.team_id
    });
  }

  // Get team members
  if (url.pathname === '/api/team' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    if (!user.team_id) return jsonResponse({ error: 'No team' }, 400);
    const members = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE team_id = ?').bind(user.team_id).all();
    return jsonResponse({ members: members.results });
  }

  // List reposts
  if (url.pathname === '/api/reposts' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const reposts = await env.DB.prepare(
      'SELECT r.*, u.name as user_name FROM reposts r JOIN users u ON r.user_id = u.id WHERE r.team_id = ? ORDER BY r.created_at DESC LIMIT 50'
    ).bind(user.team_id).all();
    return jsonResponse({ reposts: reposts.results });
  }

  // Create repost
  if (url.pathname === '/api/reposts' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    await env.DB.prepare(
      'INSERT INTO reposts (user_id, team_id, original_post_url, post_text, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.id, user.team_id, body.url, body.text || '', body.status || 'pending').run();
    return jsonResponse({ success: true });
  }

  // Invite link (generates a join URL)
  if (url.pathname === '/api/team/invite' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const team = await env.DB.prepare('SELECT name FROM teams WHERE id = ?').bind(user.team_id).first();
    const inviteUrl = `${url.origin}/register.html?team=${encodeURIComponent(team.name)}`;
    return jsonResponse({ inviteUrl });
  }

  // Logout
  if (url.pathname === '/api/auth/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': setCookie('session', '', 0)
      }
    });
  }

  // Stats
  if (url.pathname === '/api/stats') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const totalReposts = await env.DB.prepare('SELECT COUNT(*) as count FROM reposts WHERE team_id = ?').bind(user.team_id).first();
    const totalMembers = await env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE team_id = ?').bind(user.team_id).first();
    const thisWeek = await env.DB.prepare("SELECT COUNT(*) as count FROM reposts WHERE team_id = ? AND created_at > datetime('now', '-7 days')").bind(user.team_id).first();
    return jsonResponse({
      total_reposts: totalReposts?.count || 0,
      total_members: totalMembers?.count || 0,
      reposts_this_week: thisWeek?.count || 0
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
    }

    // Static assets
    return env.ASSETS.fetch(request);
  }
};
