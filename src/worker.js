import app from './index.js';
import { createReferralCode, normalizeReferralCode, referralUrl, shouldQualifyReferral } from './referrals.js';

const APP_ORIGIN = 'https://nexashare.com';

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function currentUser(request, env) {
  const session = getCookie(request, 'session');
  if (!session) return null;
  return env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.team_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`
  ).bind(await sha256(session)).first();
}

async function extensionUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return env.DB.prepare(
    `SELECT u.id FROM extension_tokens e JOIN users u ON u.id = e.user_id
     WHERE e.token_hash = ? AND e.revoked_at IS NULL`
  ).bind(await sha256(authorization.slice(7))).first();
}

async function getOrCreateReferralCode(env, userId) {
  const existing = await env.DB.prepare('SELECT id, code FROM referral_codes WHERE user_id = ?').bind(userId).first();
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = createReferralCode(randomToken());
    try {
      const result = await env.DB.prepare('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)').bind(userId, code).run();
      return { id: result.meta.last_row_id, code };
    } catch (error) {
      const raced = await env.DB.prepare('SELECT id, code FROM referral_codes WHERE user_id = ?').bind(userId).first();
      if (raced) return raced;
    }
  }
  throw new Error('Could not create a unique referral code.');
}

async function handleReferralDashboard(request, env) {
  const user = await currentUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
  const referralCode = await getOrCreateReferralCode(env, user.id);
  const rows = await env.DB.prepare(
    `SELECT r.id, r.status, r.registered_at, r.qualified_at, r.reward_status,
            COALESCE(NULLIF(trim(u.name), ''), 'NexaShare member') AS referred_name
     FROM referrals r JOIN users u ON u.id = r.referred_user_id
     WHERE r.referrer_user_id = ? ORDER BY datetime(r.registered_at) DESC LIMIT 100`
  ).bind(user.id).all();
  const referrals = rows.results || [];
  return jsonResponse({
    code: referralCode.code,
    referral_url: referralUrl(APP_ORIGIN, referralCode.code),
    summary: {
      registered: referrals.length,
      qualified: referrals.filter(item => item.status === 'qualified').length,
      rewards_applied: referrals.filter(item => item.reward_status === 'applied').length
    },
    reward_policy: 'not_configured',
    reward_note: 'Referral attribution and qualification are active. Billing credits are not applied until NexaShare subscription entitlements and Stripe webhooks are configured.',
    referrals
  });
}

async function rememberReferralOnOAuthStart(request, env, ctx) {
  const url = new URL(request.url);
  const code = normalizeReferralCode(url.searchParams.get('ref'));
  const response = await app.fetch(request, env, ctx);
  if (!code || response.status < 300 || response.status >= 400) return response;
  const referral = await env.DB.prepare('SELECT id FROM referral_codes WHERE code = ?').bind(code).first();
  if (!referral) return response;
  const location = response.headers.get('Location');
  if (!location) return response;
  const state = new URL(location).searchParams.get('state');
  if (!state) return response;
  await env.DB.prepare('UPDATE oauth_states SET referral_code_id = ? WHERE state_hash = ?')
    .bind(referral.id, await sha256(state)).run();
  return response;
}

async function attachReferralAfterOAuth(request, env, ctx) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  let referralCodeId = null;
  if (state) {
    const row = await env.DB.prepare('SELECT referral_code_id FROM oauth_states WHERE state_hash = ?')
      .bind(await sha256(state)).first();
    referralCodeId = row?.referral_code_id || null;
  }
  const response = await app.fetch(request, env, ctx);
  if (!referralCodeId || response.status !== 302) return response;
  const setCookie = response.headers.get('Set-Cookie') || '';
  const sessionMatch = setCookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!sessionMatch) return response;
  const sessionHash = await sha256(sessionMatch[1]);
  const joined = await env.DB.prepare(
    `SELECT u.id AS referred_user_id, u.created_at AS user_created_at, s.created_at AS session_created_at,
            rc.user_id AS referrer_user_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     JOIN referral_codes rc ON rc.id = ?
     WHERE s.token_hash = ?`
  ).bind(referralCodeId, sessionHash).first();
  if (!joined || Number(joined.referrer_user_id) === Number(joined.referred_user_id)) return response;
  const userCreated = new Date(String(joined.user_created_at).replace(' ', 'T') + 'Z').getTime();
  const sessionCreated = new Date(String(joined.session_created_at).replace(' ', 'T') + 'Z').getTime();
  const createdWithThisSession = Number.isFinite(userCreated) && Number.isFinite(sessionCreated)
    && Math.abs(sessionCreated - userCreated) <= 60_000;
  if (!createdWithThisSession) return response;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO referrals (referrer_user_id, referred_user_id, referral_code_id, status)
     VALUES (?, ?, ?, 'registered')`
  ).bind(joined.referrer_user_id, joined.referred_user_id, referralCodeId).run();
  return response;
}

async function qualifyReferralAfterIngest(request, env, ctx) {
  let payload = null;
  try { payload = await request.clone().json(); } catch (error) {}
  const response = await app.fetch(request, env, ctx);
  if (!response.ok || !shouldQualifyReferral(payload?.outcomes)) return response;
  const user = await extensionUser(request, env);
  if (!user) return response;
  await env.DB.prepare(
    `UPDATE referrals SET status = 'qualified', qualified_at = COALESCE(qualified_at, datetime('now')),
       updated_at = datetime('now') WHERE referred_user_id = ? AND status = 'registered'`
  ).bind(user.id).run();
  return response;
}

async function injectReferralDashboardLink(request, env, ctx) {
  const response = await app.fetch(request, env, ctx);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;
  const html = await response.text();
  const replacement = `<section class="view" id="view-referral"><div class="panel"><h2>Referral program</h2><p class="muted">Invite new NexaShare members with your personal link and track when they become qualified after their first LinkedIn-confirmed repost.</p><p><a class="button" href="/referral.html">Open referral dashboard</a></p><div class="notice warning">Referral rewards are not applied to billing yet. Attribution and qualification are active; reward credits remain disabled until Stripe entitlements are verified.</div></div></section>`;
  const rewritten = html.replace(/<section class="view" id="view-referral">[\s\S]*?<\/section>/, replacement);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/referrals' && request.method === 'GET') return handleReferralDashboard(request, env);
    if (url.pathname === '/api/auth/linkedin' && request.method === 'GET') return rememberReferralOnOAuthStart(request, env, ctx);
    if (url.pathname === '/api/auth/callback' && request.method === 'GET') return attachReferralAfterOAuth(request, env, ctx);
    if (url.pathname === '/api/extension/ingest' && request.method === 'POST') return qualifyReferralAfterIngest(request, env, ctx);
    if (url.pathname === '/dashboard.html' && request.method === 'GET') return injectReferralDashboardLink(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === 'function') return app.scheduled(event, env, ctx);
  }
};
