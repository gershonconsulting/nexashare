const LINKEDIN_CLIENT_ID = '78dsjq2rbcv26t';
const APP_ORIGIN = 'https://nexashare.com';
const LINKEDIN_REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback`;
const LINKEDIN_SCOPES = 'openid profile email';
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/5kQdRb1rc6mvfcZ8yvcfK00';
const SETUP_REMINDER_TYPE = 'missing_company_after_connection';
const SETUP_REMINDER_FROM = 'NexaShare <hello@nexashare.com>';
const DAILY_REPORT_TYPE = 'daily_repost_report';

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

function validPersonVanity(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,99}$/.test(value);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function buildMissingCompanyReminder(user) {
  const rawFirstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const firstName = escapeHtml(rawFirstName);
  const setupUrl = `${APP_ORIGIN}/onboarding.html`;
  return {
    to: user.email,
    from: SETUP_REMINDER_FROM,
    subject: 'NexaShare is connected — add your first company',
    text: `Hi ${rawFirstName},\n\nNexaShare is connected, but it does not yet have a company to monitor for LinkedIn posts. Add the LinkedIn company page for your employer, partner, or client to finish setup.\n\nFinish setup: ${setupUrl}\n\nNexaShare will not attempt a repost until you add a company. This is a one-time setup reminder.`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#12243a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(15,52,86,.12)"><tr><td style="background:linear-gradient(135deg,#075985,#0ea5e9);padding:30px;color:#fff"><div style="font-size:26px;font-weight:800">NexaShare</div><div style="margin-top:8px;font-size:16px;opacity:.92">Your connection is ready.</div></td></tr><tr><td style="padding:34px"><h1 style="font-size:26px;line-height:1.25;margin:0 0 16px">One small step, ${firstName}</h1><p style="font-size:17px;line-height:1.6;margin:0 0 18px">NexaShare is connected, but it does not yet have a company to monitor for LinkedIn posts.</p><div style="background:#eff8ff;border:1px solid #bae6fd;border-radius:12px;padding:18px;margin:22px 0"><strong>Add the LinkedIn company page</strong><br><span style="color:#40566e;line-height:1.6">Choose your employer, a partner, or a client whose content you want to repost.</span></div><p style="text-align:center;margin:28px 0"><a href="${setupUrl}" style="display:inline-block;background:#0b78b9;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px">Finish my setup</a></p><p style="font-size:14px;line-height:1.55;color:#60758a;margin:0">NexaShare will not attempt a repost until you add a company. This is a one-time setup reminder.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendMissingCompanyReminders(env) {
  if (!env.EMAIL) {
    console.log('Setup reminders skipped: EMAIL binding is not configured.');
    return { sent: 0, skipped: 'email_not_configured' };
  }
  const eligible = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM users u
     WHERE u.team_id IS NOT NULL AND u.email IS NOT NULL AND trim(u.email) <> ''
       AND datetime(u.created_at) <= datetime('now', '-1 day')
       AND EXISTS (SELECT 1 FROM extension_tokens et WHERE et.user_id = u.id AND et.revoked_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.team_id = u.team_id)
       AND NOT EXISTS (
         SELECT 1 FROM setup_reminders sr WHERE sr.user_id = u.id AND sr.reminder_type = ?
           AND (sr.status = 'sent' OR sr.attempt_count >= 3 OR sr.attempted_at > datetime('now', '-1 day'))
       ) ORDER BY u.created_at ASC LIMIT 100`
  ).bind(SETUP_REMINDER_TYPE).all();
  let sent = 0;
  for (const user of eligible.results || []) {
    await env.DB.prepare(
      `INSERT INTO setup_reminders (user_id, reminder_type, status, attempt_count, attempted_at, updated_at)
       VALUES (?, ?, 'sending', 1, datetime('now'), datetime('now'))
       ON CONFLICT(user_id, reminder_type) DO UPDATE SET status = 'sending',
         attempt_count = attempt_count + 1, attempted_at = datetime('now'), updated_at = datetime('now'), error = NULL`
    ).bind(user.id, SETUP_REMINDER_TYPE).run();
    try {
      const result = await env.EMAIL.send(buildMissingCompanyReminder(user));
      await env.DB.prepare(
        `UPDATE setup_reminders SET status = 'sent', sent_at = datetime('now'), provider_message_id = ?, updated_at = datetime('now'), error = NULL
         WHERE user_id = ? AND reminder_type = ?`
      ).bind(result?.messageId || null, user.id, SETUP_REMINDER_TYPE).run();
      sent++;
    } catch (error) {
      await env.DB.prepare(
        `UPDATE setup_reminders SET status = 'failed', error = ?, updated_at = datetime('now') WHERE user_id = ? AND reminder_type = ?`
      ).bind(String(error?.message || 'Email provider rejected the send').slice(0, 500), user.id, SETUP_REMINDER_TYPE).run();
      console.error('Setup reminder failed', { userId: user.id, code: error?.code, message: error?.message });
    }
  }
  return { sent, eligible: (eligible.results || []).length };
}

function buildDailyRepostReport(user, rows) {
  const confirmed = rows.filter(row => row.status === 'confirmed');
  const failed = rows.filter(row => row.status === 'failed');
  const skipped = rows.filter(row => row.status === 'skipped' || row.status === 'already_reposted');
  const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const dashboardUrl = `${APP_ORIGIN}/dashboard.html#reposts`;
  const summary = `${confirmed.length} confirmed, ${failed.length} failed, and ${skipped.length} skipped in the last 24 hours.`;
  const itemHtml = rows.length ? rows.slice(0, 20).map(row => `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.company_name || 'Company')}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.status.replaceAll('_', ' '))}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb"><a href="${escapeHtml(row.original_post_url)}">Original</a>${row.repost_url ? ` · <a href="${escapeHtml(row.repost_url)}">Repost</a>` : ''}</td></tr>`).join('') : '<tr><td colspan="3" style="padding:18px;color:#667085">No repost outcomes were recorded in the last 24 hours.</td></tr>';
  return {
    to: user.email,
    from: SETUP_REMINDER_FROM,
    subject: `NexaShare daily report: ${confirmed.length} confirmed repost${confirmed.length === 1 ? '' : 's'}`,
    text: `Hi ${firstName},\n\n${summary}\n\nReview every original post, repost link, and outcome: ${dashboardUrl}`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#0a66c2;color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">NexaShare daily report</div><div style="margin-top:7px">${escapeHtml(summary)}</div></td></tr><tr><td style="padding:26px"><p>Hi ${escapeHtml(firstName)},</p><table width="100%" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" style="padding:10px;background:#f8fafc">Company</th><th align="left" style="padding:10px;background:#f8fafc">Outcome</th><th align="left" style="padding:10px;background:#f8fafc">Links</th></tr></thead><tbody>${itemHtml}</tbody></table><p style="text-align:center;margin:26px 0 4px"><a href="${dashboardUrl}" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px">Review repost history</a></p><p style="font-size:12px;color:#667085">Only LinkedIn-confirmed reposts are counted as successful.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendDailyRepostReports(env) {
  if (!env.EMAIL) return { sent: 0, skipped: 'email_not_configured' };
  const users = await env.DB.prepare(
    `SELECT DISTINCT u.id, u.email, u.name, u.team_id FROM users u
     JOIN companies c ON c.team_id = u.team_id
     JOIN extension_tokens et ON et.user_id = u.id AND et.revoked_at IS NULL
     WHERE u.email IS NOT NULL AND trim(u.email) <> ''
       AND NOT EXISTS (SELECT 1 FROM daily_reports d WHERE d.user_id = u.id AND d.report_date = date('now'))
     ORDER BY u.id LIMIT 500`
  ).all();
  let sent = 0;
  for (const user of users.results || []) {
    const outcomes = await env.DB.prepare(
      `SELECT company_name, original_post_url, repost_url, post_text, status, attempted_at
       FROM reposts WHERE user_id = ? AND datetime(attempted_at) >= datetime('now', '-1 day')
       ORDER BY datetime(attempted_at) DESC LIMIT 100`
    ).bind(user.id).all();
    try {
      const result = await env.EMAIL.send(buildDailyRepostReport(user, outcomes.results || []));
      await env.DB.prepare(
        `INSERT INTO daily_reports (user_id, report_date, status, outcome_count, provider_message_id, sent_at)
         VALUES (?, date('now'), 'sent', ?, ?, datetime('now'))`
      ).bind(user.id, (outcomes.results || []).length, result?.messageId || null).run();
      sent++;
    } catch (error) {
      console.error('Daily report failed', { userId: user.id, message: error?.message });
    }
  }
  return { sent, eligible: (users.results || []).length };
}

async function handleAuth(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/auth/linkedin') {
    const state = randomToken();
    await env.DB.prepare(
      "INSERT INTO oauth_states (state_hash, team_name, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))"
    ).bind(await sha256(state), '').run();
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
      "SELECT 1 AS valid FROM oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
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

      const existingUser = await env.DB.prepare('SELECT id, team_id FROM users WHERE linkedin_id = ?').bind(profile.sub).first();
      let teamId = existingUser?.team_id || null;
      if (!teamId) {
        const accountName = `${profile.name || profile.email || 'My'} account`.trim().slice(0, 100);
        const teamResult = await env.DB.prepare('INSERT INTO teams (name) VALUES (?)').bind(accountName).run();
        teamId = teamResult.meta.last_row_id;
      }
      let userId;
      if (existingUser) {
        userId = existingUser.id;
        if (!existingUser.team_id) {
          await env.DB.prepare('UPDATE users SET team_id = ?, linkedin_access_token = ? WHERE id = ?').bind(teamId, tokenData.access_token, userId).run();
        } else {
          await env.DB.prepare('UPDATE users SET linkedin_access_token = ? WHERE id = ?').bind(tokenData.access_token, userId).run();
        }
      } else {
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, linkedin_id, linkedin_access_token, team_id, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(profile.email || '', profile.name || '', profile.sub, tokenData.access_token, teamId, 'admin').run();
        userId = result.meta.last_row_id;
      }

      const sessionToken = randomToken();
      await env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
      ).bind(await sha256(sessionToken), userId).run();
      let destination = `${APP_ORIGIN}/dashboard.html`;
      const companyCount = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM companies WHERE team_id = ?'
      ).bind(teamId).first();
      if (!Number(companyCount?.count || 0)) destination = `${APP_ORIGIN}/onboarding.html`;
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
        setup_reminder_email: env.EMAIL ? 'configured' : 'not_configured',
        canonical_origin: APP_ORIGIN,
        checked_at: new Date().toISOString()
      });
    } catch (error) {
      return jsonResponse({
        status: 'degraded',
        database: 'unavailable',
        setup_reminder_email: env.EMAIL ? 'configured' : 'not_configured',
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

  if (url.pathname === '/api/people' && request.method === 'GET') {
    const user = await getUser(request, env) || await getExtensionUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const people = await env.DB.prepare(
      'SELECT id, vanity, name, enabled, created_at FROM people WHERE team_id = ? ORDER BY created_at DESC'
    ).bind(user.team_id).all();
    return jsonResponse({ people: people.results });
  }

  if (url.pathname === '/api/people' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    const vanity = String(body.vanity || '').toLowerCase();
    if (!validPersonVanity(vanity)) return jsonResponse({ error: 'Invalid LinkedIn personal-profile URL' }, 400);
    const name = String(body.name || vanity.replace(/[-_]/g, ' ')).trim().slice(0, 100);
    await env.DB.prepare(
      `INSERT INTO people (team_id, vanity, name, enabled) VALUES (?, ?, ?, 1)
       ON CONFLICT(team_id, vanity) DO UPDATE SET name = excluded.name, enabled = 1`
    ).bind(user.team_id, vanity, name).run();
    return jsonResponse({ success: true }, 201);
  }

  const personMatch = url.pathname.match(/^\/api\/people\/(\d+)$/);
  if (personMatch && request.method === 'PATCH') {
    const user = await getUser(request, env) || await getExtensionUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    let result;
    if (typeof body.name === 'string') {
      const name = body.name.trim().replace(/\s+/g, ' ').slice(0, 100);
      if (name.length < 2 || /^linkedin$/i.test(name)) return jsonResponse({ error: 'Invalid person name' }, 400);
      result = await env.DB.prepare('UPDATE people SET name = ? WHERE id = ? AND team_id = ?').bind(name, Number(personMatch[1]), user.team_id).run();
    } else if (typeof body.enabled === 'boolean') {
      result = await env.DB.prepare('UPDATE people SET enabled = ? WHERE id = ? AND team_id = ?').bind(body.enabled ? 1 : 0, Number(personMatch[1]), user.team_id).run();
    } else return jsonResponse({ error: 'Provide a person name or enabled state' }, 400);
    if (!result.meta.changes) return jsonResponse({ error: 'Person not found' }, 404);
    return jsonResponse({ success: true, enabled: body.enabled, name: body.name });
  }

  if (personMatch && request.method === 'DELETE') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const result = await env.DB.prepare('DELETE FROM people WHERE id = ? AND team_id = ?').bind(Number(personMatch[1]), user.team_id).run();
    if (!result.meta.changes) return jsonResponse({ error: 'Person not found' }, 404);
    return jsonResponse({ success: true });
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

  if (companyMatch && request.method === 'DELETE') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const result = await env.DB.prepare('DELETE FROM companies WHERE id = ? AND team_id = ?').bind(Number(companyMatch[1]), user.team_id).run();
    if (!result.meta.changes) return jsonResponse({ error: 'Company not found' }, 404);
    return jsonResponse({ success: true });
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
         (user_id, team_id, original_post_url, repost_url, post_text, status, company_name, detail, attempted_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id, user.team_id, postUrl,
        typeof outcome.repostUrl === 'string' && outcome.repostUrl.startsWith('https://www.linkedin.com/') ? outcome.repostUrl.slice(0, 1000) : null,
        String(outcome.postTextSnippet || '').slice(0, 500),
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
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([sendMissingCompanyReminders(env), sendDailyRepostReports(env)]));
  }
};
