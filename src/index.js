const LINKEDIN_CLIENT_ID = '78dsjq2rbcv26t';
const APP_ORIGIN = 'https://nexashare.com';
const LINKEDIN_REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback`;
const LINKEDIN_SCOPES = 'openid profile email';
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/5kQdRb1rc6mvfcZ8yvcfK00';

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function setCookie(name, value, maxAge = 86400 * 30) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function validCompanyVanity(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
}

async function handleAuth(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/auth/linkedin') {
    const teamName = (url.searchParams.get('team') || '').trim().slice(0, 100);
    const state = randomToken();
    await env.DB.prepare(
      "INSERT INTO oauth_states (state_hash, team_name, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))"
    ).bind(await sha256(state), teamName).run();
    const linkedinUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&scope=${encodeURIComponent(LINKEDIN_SCOPES)}&state=${encodeURIComponent(state)}`;
    return Response.redirect(linkedinUrl, 302);
  }

  if (url.pathname === '/api/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error || !code || !state) {
      return Response.redirect(`${APP_ORIGIN}/login.html?error=${encodeURIComponent(error || 'auth_failed')}`, 302);
    }

    const stateHash = await sha256(state);
    const stateRow = await env.DB.prepare(
      "SELECT team_name FROM oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
    ).bind(stateHash).first();
    if (!stateRow) return Response.redirect(`${APP_ORIGIN}/login.html?error=invalid_state`, 302);
    await env.DB.prepare("UPDATE oauth_states SET used_at = datetime('now') WHERE state_hash = ?").bind(stateHash).run();

    try {
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
      if (!tokenData.access_token) return Response.redirect(`${APP_ORIGIN}/login.html?error=token_failed`, 302);

      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (!profileRes.ok) return Response.redirect(`${APP_ORIGIN}/login.html?error=profile_failed`, 302);
      const profile = await profileRes.json();

      let teamId = null;
      if (stateRow.team_name) {
        const existingTeam = await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind(stateRow.team_name).first();
        if (existingTeam) {
          teamId = existingTeam.id;
        } else {
          const result = await env.DB.prepare('INSERT INTO teams (name) VALUES (?)').bind(stateRow.team_name).run();
          teamId = result.meta.last_row_id;
        }
      }

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
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, linkedin_id, linkedin_access_token, team_id, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(profile.email || '', profile.name || '', profile.sub, tokenData.access_token, teamId, teamId ? 'admin' : 'member').run();
        userId = result.meta.last_row_id;
      }

      const sessionToken = randomToken();
      await env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
      ).bind(await sha256(sessionToken), userId).run();
      let destination = `${APP_ORIGIN}/dashboard.html`;
      if (teamId) {
        const companyCount = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM companies WHERE team_id = ?'
        ).bind(teamId).first();
        if (!Number(companyCount?.count || 0)) destination = `${APP_ORIGIN}/onboarding.html`;
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: destination,
          'Set-Cookie': setCookie('session', sessionToken)
        }
      });
    } catch (err) {
      return Response.redirect(`${APP_ORIGIN}/login.html?error=${encodeURIComponent(err.message)}`, 302);
    }
  }
  return null;
}

async function getUser(request, env) {
  const session = getCookie(request, 'session');
  if (!session) return null;
  return env.DB.prepare(
    `SELECT u.*, t.name AS team_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN teams t ON u.team_id = t.id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`
  ).bind(await sha256(session)).first();
}

async function getExtensionUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return env.DB.prepare(
    `SELECT u.*, t.name AS team_name
     FROM extension_tokens e JOIN users u ON u.id = e.user_id
     LEFT JOIN teams t ON u.team_id = t.id
     WHERE e.token_hash = ? AND e.revoked_at IS NULL`
  ).bind(await sha256(auth.slice(7))).first();
}

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const authResponse = await handleAuth(request, env);
  if (authResponse) return authResponse;

  if (url.pathname === '/api/health' && request.method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      return jsonResponse({
        status: 'ready',
        database: 'connected',
        canonical_origin: APP_ORIGIN,
        checked_at: new Date().toISOString()
      });
    } catch (error) {
      return jsonResponse({
        status: 'degraded',
        database: 'unavailable',
        canonical_origin: APP_ORIGIN,
        checked_at: new Date().toISOString()
      }, 503);
    }
  }

  if (url.pathname === '/api/user') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    return jsonResponse({ id: user.id, name: user.name, email: user.email, role: user.role, team_name: user.team_name, team_id: user.team_id });
  }

  if (url.pathname === '/api/subscription' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    let createdAt = new Date(user.created_at || Date.now());
    if (Number.isNaN(createdAt.getTime())) createdAt = new Date();
    const trialEndsAt = new Date(createdAt.getTime() + 30 * 86400000);
    const daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000));
    const firstConfirmed = user.team_id ? await env.DB.prepare(
      `SELECT MIN(COALESCE(confirmed_at, created_at)) AS first_confirmed_at
       FROM reposts WHERE team_id = ? AND status = 'confirmed'`
    ).bind(user.team_id).first() : null;
    const hasConfirmedRepost = !!firstConfirmed?.first_confirmed_at;
    const displayStatus = daysRemaining > 0
      ? 'trial'
      : (hasConfirmedRepost ? 'trial_complete_unverified' : 'trial_extended_until_first_confirmed_repost');
    return jsonResponse({
      display_status: displayStatus,
      trial_days: 30,
      trial_started_at: createdAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      days_remaining: daysRemaining,
      has_confirmed_repost: hasConfirmedRepost,
      first_confirmed_repost_at: firstConfirmed?.first_confirmed_at || null,
      extension_policy: 'After day 30, free access continues until the first LinkedIn-confirmed repost. Failed, skipped, and unverified attempts do not end the extension.',
      checkout_url: STRIPE_CHECKOUT_URL,
      enforcement: 'not_configured',
      note: 'Checkout completion and subscription activation are not verified until Stripe webhooks and entitlement storage are configured.'
    });
  }

  if (url.pathname === '/api/team' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    if (!user.team_id) return jsonResponse({ members: [] });
    const members = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE team_id = ?').bind(user.team_id).all();
    return jsonResponse({ members: members.results });
  }

  if (url.pathname === '/api/companies' && request.method === 'GET') {
    const user = await getUser(request, env) || await getExtensionUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const companies = await env.DB.prepare(
      'SELECT id, vanity, name, enabled, created_at FROM companies WHERE team_id = ? ORDER BY created_at DESC'
    ).bind(user.team_id).all();
    return jsonResponse({ companies: companies.results });
  }

  if (url.pathname === '/api/companies' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    const vanity = String(body.vanity || '').toLowerCase();
    if (!validCompanyVanity(vanity)) return jsonResponse({ error: 'Invalid LinkedIn company URL' }, 400);
    const name = String(body.name || vanity.replace(/-/g, ' ')).trim().slice(0, 100);
    await env.DB.prepare(
      `INSERT INTO companies (team_id, vanity, name, enabled) VALUES (?, ?, ?, 1)
       ON CONFLICT(team_id, vanity) DO UPDATE SET name = excluded.name, enabled = 1`
    ).bind(user.team_id, vanity, name).run();
    return jsonResponse({ success: true }, 201);
  }

  const companyMatch = url.pathname.match(/^\/api\/companies\/(\d+)$/);
  if (companyMatch && request.method === 'PATCH') {
    const user = await getUser(request, env) || await getExtensionUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    let result;
    if (typeof body.name === 'string') {
      const name = body.name.trim().replace(/\s+/g, ' ').slice(0, 100);
      if (name.length < 2 || /^\d+$/.test(name) || /^linkedin$/i.test(name)) return jsonResponse({ error: 'Invalid company name' }, 400);
      result = await env.DB.prepare(
        'UPDATE companies SET name = ? WHERE id = ? AND team_id = ?'
      ).bind(name, Number(companyMatch[1]), user.team_id).run();
    } else if (typeof body.enabled === 'boolean') {
      result = await env.DB.prepare(
        'UPDATE companies SET enabled = ? WHERE id = ? AND team_id = ?'
      ).bind(body.enabled ? 1 : 0, Number(companyMatch[1]), user.team_id).run();
    } else {
      return jsonResponse({ error: 'Provide a company name or enabled state' }, 400);
    }
    if (!result.meta.changes) return jsonResponse({ error: 'Company not found' }, 404);
    return jsonResponse({ success: true, enabled: body.enabled, name: body.name });
  }

  if (url.pathname === '/api/extension/token' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const token = randomToken();
    await env.DB.prepare('UPDATE extension_tokens SET revoked_at = datetime(\'now\') WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare(
      'INSERT INTO extension_tokens (token_hash, user_id, team_id) VALUES (?, ?, ?)'
    ).bind(await sha256(token), user.id, user.team_id).run();
    return jsonResponse({ token, apiBase: APP_ORIGIN });
  }

  if (url.pathname === '/api/extension/ingest' && request.method === 'POST') {
    const user = await getExtensionUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Invalid extension token' }, 401);
    const body = await request.json();
    const outcomes = Array.isArray(body.outcomes) ? body.outcomes.slice(0, 100) : [];
    let accepted = 0;
    for (const outcome of outcomes) {
      const allowed = ['confirmed', 'failed', 'already_reposted', 'skipped'];
      const status = allowed.includes(outcome.status) ? outcome.status : 'failed';
      const postUrl = String(outcome.postUrl || '').slice(0, 1000);
      if (!postUrl.startsWith('https://www.linkedin.com/')) continue;
      await env.DB.prepare(
        `INSERT INTO reposts
         (user_id, team_id, original_post_url, post_text, status, company_name, detail, attempted_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id, user.team_id, postUrl, String(outcome.postTextSnippet || '').slice(0, 500),
        status, String(outcome.companyName || '').slice(0, 100), String(outcome.detail || '').slice(0, 500),
        outcome.attemptedAt || new Date().toISOString(), status === 'confirmed' ? (outcome.confirmedAt || new Date().toISOString()) : null
      ).run();
      accepted++;
    }
    return jsonResponse({ success: true, accepted });
  }

  if (url.pathname === '/api/reposts' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const reposts = await env.DB.prepare(
      'SELECT r.*, u.name AS user_name FROM reposts r JOIN users u ON r.user_id = u.id WHERE r.team_id = ? ORDER BY COALESCE(r.attempted_at, r.created_at) DESC LIMIT 100'
    ).bind(user.team_id).all();
    return jsonResponse({ reposts: reposts.results });
  }

  if (url.pathname === '/api/team/invite' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user || user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const team = await env.DB.prepare('SELECT name FROM teams WHERE id = ?').bind(user.team_id).first();
    return jsonResponse({ inviteUrl: `${url.origin}/register.html?team=${encodeURIComponent(team.name)}` });
  }

  if (url.pathname === '/api/auth/logout') {
    const session = getCookie(request, 'session');
    if (session) await env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?").bind(await sha256(session)).run();
    return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN}/`, 'Set-Cookie': setCookie('session', '', 0) } });
  }

  if (url.pathname === '/api/stats') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const confirmed = await env.DB.prepare("SELECT COUNT(*) AS count FROM reposts WHERE team_id = ? AND status = 'confirmed'").bind(user.team_id).first();
    const failed = await env.DB.prepare("SELECT COUNT(*) AS count FROM reposts WHERE team_id = ? AND status = 'failed'").bind(user.team_id).first();
    const members = await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE team_id = ?').bind(user.team_id).first();
    const thisWeek = await env.DB.prepare("SELECT COUNT(*) AS count FROM reposts WHERE team_id = ? AND status = 'confirmed' AND COALESCE(confirmed_at, created_at) > datetime('now', '-7 days')").bind(user.team_id).first();
    return jsonResponse({
      total_reposts: confirmed?.count || 0,
      failed_attempts: failed?.count || 0,
      total_members: members?.count || 0,
      reposts_this_week: thisWeek?.count || 0
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/api/')) return handleAPI(request, env);
    return env.ASSETS.fetch(request);
  }
};
