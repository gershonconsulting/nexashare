import { ACCESS_MODE, SUCCESS_TARGET_PERCENT } from './access-policy.js';
import { collectDailySeries } from './reporting.js';
import { getIntelligence } from './intelligence.js';
import { referralCode, attributeReferral, getReferralDashboard, handleReferralPayment } from './referrals.js';
import { getCampaignHealth, markDeliveryProcessing, recordDeliveryOutcome } from './delivery-engine.js';
import { buildAdminReportEmail, collectAdminReportData, reportRecipients, sendAdminDailyReport } from './admin-report.js';

const LINKEDIN_CLIENT_ID = '78dsjq2rbcv26t';
const APP_ORIGIN = 'https://nexashare.com';
const LINKEDIN_REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback`;
const LINKEDIN_SCOPES = 'openid profile email';
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/5kQdRb1rc6mvfcZ8yvcfK00';
const SETUP_REMINDER_TYPE = 'missing_company_after_connection';
const CURRENT_EXTENSION_VERSION = '1.2.25';
const SETUP_REMINDER_FROM = 'NexaShare <hello@nexashare.com>';
const DAILY_REPORT_TYPE = 'daily_repost_report';
const REGISTRATION_NOTIFICATION_FROM = SETUP_REMINDER_FROM;

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
  return typeof value === 'string' && /^(?:[a-zA-Z0-9_-]|%[0-9A-Fa-f]{2}){3,100}$/.test(value);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function extractHashtags(value) {
  const matches = String(value || '').match(/#[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu) || [];
  return [...new Set(matches.map(tag => tag.slice(1).replace(/[.,!?;:)\]}]+$/g, '').toLowerCase()).filter(Boolean))].slice(0, 50);
}

async function sendEmailWithResend(env, message) {
  if (!env.RESEND_API_KEY) {
    const error = new Error('Resend is not configured.');
    error.code = 'resend_not_configured';
    throw error;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, text: message.text, html: message.html })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const error = new Error(String(payload.message || `Resend returned HTTP ${response.status}`).slice(0, 500));
    error.code = 'resend_send_failed';
    throw error;
  }
  return { messageId: payload.id };
}

function buildRegistrationNotification(env, user) {
  const registeredAt = new Date().toISOString();
  const name = String(user.name || '').trim() || 'Not provided';
  const email = String(user.email || '').trim() || 'Not provided';
  return {
    to: env.REGISTRATION_NOTIFICATION_TO,
    from: REGISTRATION_NOTIFICATION_FROM,
    subject: `New NexaShare registration: ${name}`,
    text: `A new user registered on NexaShare.\n\nName: ${name}\nEmail: ${email}\nUser ID: ${user.id}\nTeam ID: ${user.teamId}\nRegistered at: ${registeredAt}`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#0a66c2;color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">New NexaShare registration</div></td></tr><tr><td style="padding:26px"><table width="100%" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:9px 0;color:#667085">Name</td><td style="padding:9px 0;font-weight:700">${escapeHtml(name)}</td></tr><tr><td style="padding:9px 0;color:#667085">Email</td><td style="padding:9px 0;font-weight:700">${escapeHtml(email)}</td></tr><tr><td style="padding:9px 0;color:#667085">User ID</td><td style="padding:9px 0">${escapeHtml(user.id)}</td></tr><tr><td style="padding:9px 0;color:#667085">Team ID</td><td style="padding:9px 0">${escapeHtml(user.teamId)}</td></tr><tr><td style="padding:9px 0;color:#667085">Registered at</td><td style="padding:9px 0">${escapeHtml(registeredAt)}</td></tr></table></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendRegistrationNotification(env, user) {
  if (!env.RESEND_API_KEY || !env.REGISTRATION_NOTIFICATION_TO) {
    console.log('Registration notification skipped: Resend or recipient is not configured.');
    return { sent: 0, skipped: 'registration_notification_not_configured' };
  }
  try {
    const result = await sendEmailWithResend(env, buildRegistrationNotification(env, user));
    return { sent: 1, messageId: result.messageId };
  } catch (error) {
    console.error('Registration notification failed', {
      userId: user.id,
      code: error?.code,
      message: error?.message
    });
    return { sent: 0, error: error?.code || 'registration_notification_failed' };
  }
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
  if (!env.RESEND_API_KEY) {
    console.log('Setup reminders skipped: RESEND_API_KEY is not configured.');
    return { sent: 0, skipped: 'resend_not_configured' };
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
      const result = await sendEmailWithResend(env, buildMissingCompanyReminder(user));
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
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: 'resend_not_configured' };
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
      const result = await sendEmailWithResend(env, buildDailyRepostReport(user, outcomes.results || []));
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

async function handleAuth(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === '/api/auth/linkedin') {
    const state = randomToken();
    await env.DB.prepare(
      "INSERT INTO oauth_states (state_hash, team_name, referral_code, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))"
    ).bind(await sha256(state), '', referralCode(url.searchParams.get('ref') || getCookie(request, 'nexashare_ref'))).run();
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
      "SELECT 1 AS valid, referral_code FROM oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
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

      const linkedInUser = await env.DB.prepare(
        'SELECT id, team_id, email FROM users WHERE linkedin_id = ?'
      ).bind(profile.sub).first();

      const verifiedEmail = (profile.email_verified === true || profile.email_verified === 'true')
        ? String(profile.email || '').trim().toLowerCase()
        : '';
      const emailUser = verifiedEmail
        ? await env.DB.prepare(
            'SELECT id, team_id, email FROM users WHERE lower(trim(email)) = ? ORDER BY id ASC LIMIT 1'
          ).bind(verifiedEmail).first()
        : null;

      // Reconcile a LinkedIn identity change back to the existing NexaShare
      // account when LinkedIn confirms the same email address.
      let existingUser = linkedInUser || emailUser || null;
      if (linkedInUser && emailUser && linkedInUser.id !== emailUser.id) {
        const teamIds = [linkedInUser.team_id, emailUser.team_id].filter(Boolean);
        let preferredTeamId = linkedInUser.team_id || emailUser.team_id || null;
        let bestScore = -1;
        for (const candidateTeamId of teamIds) {
          const scoreRow = await env.DB.prepare(
            `SELECT
               (SELECT COUNT(*) FROM companies WHERE team_id = ?) +
               (SELECT COUNT(*) FROM people WHERE team_id = ?) +
               (SELECT COUNT(*) FROM reposts WHERE team_id = ?) AS score`
          ).bind(candidateTeamId, candidateTeamId, candidateTeamId).first();
          const score = Number(scoreRow?.score || 0);
          if (score > bestScore) {
            bestScore = score;
            preferredTeamId = candidateTeamId;
          }
        }
        if (preferredTeamId && linkedInUser.team_id !== preferredTeamId) {
          await env.DB.prepare(
            'UPDATE users SET team_id = ?, email = ?, name = ?, linkedin_access_token = ? WHERE id = ?'
          ).bind(preferredTeamId, profile.email || linkedInUser.email || '', profile.name || '', tokenData.access_token, linkedInUser.id).run();
          linkedInUser.team_id = preferredTeamId;
        }
        existingUser = linkedInUser;
      }

      let teamId = existingUser?.team_id || null;
      if (!teamId) {
        const accountName = `${profile.name || profile.email || 'My'} account`.trim().slice(0, 100);
        const teamResult = await env.DB.prepare('INSERT INTO teams (name) VALUES (?)').bind(accountName).run();
        teamId = teamResult.meta.last_row_id;
      }
      let userId;
      if (existingUser) {
        userId = existingUser.id;
        if (!linkedInUser && emailUser && emailUser.id === existingUser.id) {
          await env.DB.prepare(
            'UPDATE users SET linkedin_id = ?, linkedin_access_token = ?, email = ?, name = ?, team_id = ? WHERE id = ?'
          ).bind(profile.sub, tokenData.access_token, profile.email || '', profile.name || '', teamId, userId).run();
        } else {
          await env.DB.prepare(
            'UPDATE users SET linkedin_access_token = ?, email = ?, name = ?, team_id = ? WHERE id = ?'
          ).bind(tokenData.access_token, profile.email || existingUser.email || '', profile.name || '', teamId, userId).run();
        }
      } else {
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, linkedin_id, linkedin_access_token, team_id, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(profile.email || '', profile.name || '', profile.sub, tokenData.access_token, teamId, 'admin').run();
        userId = result.meta.last_row_id;
        await attributeReferral(env.DB, userId, stateRow.referral_code);
        const notification = sendRegistrationNotification(env, {
          id: userId,
          teamId,
          name: profile.name,
          email: profile.email
        });
        if (ctx?.waitUntil) ctx.waitUntil(notification);
        else await notification;
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

// The daily report cannot tell "quiet day" from "never ran" without these two
// signals, so every authenticated extension call refreshes them.
async function touchExtensionToken(request, env, version) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return;
  try {
    await env.DB.prepare(
      `UPDATE extension_tokens
       SET last_seen_at = datetime('now'),
           extension_version = COALESCE(?, extension_version)
       WHERE token_hash = ?`
    ).bind(version ? String(version).slice(0, 20) : null, await sha256(auth.slice(7))).run();
  } catch (error) {
    console.error('touchExtensionToken failed', { message: error?.message });
  }
}

async function handleAPI(request, env, ctx) {
  const url = new URL(request.url);
  const authResponse = await handleAuth(request, env, ctx);
  if (authResponse) return authResponse;

  if (url.pathname === '/api/health' && request.method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      return jsonResponse({
        status: 'ready',
        database: 'connected',
        setup_reminder_email: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        resend_email: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        registration_notification: env.RESEND_API_KEY && env.REGISTRATION_NOTIFICATION_TO ? 'configured' : 'not_configured',
        daily_repost_report: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        current_extension_version: CURRENT_EXTENSION_VERSION,
        application_version: '1.4.0',
        released_at: '2026-10-07',
        workers_ai: env.AI ? 'configured' : 'not_configured',
        admin_daily_report: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        admin_report_recipient: reportRecipients(env).join(', '),
        canonical_origin: APP_ORIGIN,
        checked_at: new Date().toISOString()
      });
    } catch (error) {
      return jsonResponse({
        status: 'degraded',
        database: 'unavailable',
        setup_reminder_email: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        resend_email: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        registration_notification: env.RESEND_API_KEY && env.REGISTRATION_NOTIFICATION_TO ? 'configured' : 'not_configured',
        daily_repost_report: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        current_extension_version: CURRENT_EXTENSION_VERSION,
        application_version: '1.4.0',
        released_at: '2026-10-07',
        workers_ai: env.AI ? 'configured' : 'not_configured',
        admin_daily_report: env.RESEND_API_KEY ? 'configured' : 'not_configured',
        admin_report_recipient: reportRecipients(env).join(', '),
        canonical_origin: APP_ORIGIN,
        checked_at: new Date().toISOString()
      }, 503);
    }
  }

  if (url.pathname === '/api/referrals/stripe-webhook' && request.method === 'POST') return handleReferralPayment(request, env);
  if (['/api/referrals', '/api/reporting/daily', '/api/intelligence'].includes(url.pathname)) {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const days = Number(url.searchParams.get('days') || 30);
    if (![7, 30, 90].includes(days)) return jsonResponse({ error: 'Choose 7, 30, or 90 days' }, 400);
    if (request.method !== 'GET' && !(url.pathname === '/api/intelligence' && request.method === 'POST')) return jsonResponse({ error: 'Method not allowed' }, 405);
    if (request.method === 'POST' && request.headers.get('Origin') !== APP_ORIGIN) return jsonResponse({ error: 'Invalid request origin' }, 403);
    try {
      if (url.pathname === '/api/referrals') return jsonResponse(await getReferralDashboard(env.DB, user, Boolean(env.STRIPE_WEBHOOK_SECRET)));
      if (url.pathname === '/api/reporting/daily') return jsonResponse(await collectDailySeries(env.DB, user.id, days));
      const result = await getIntelligence(env, user, days, request.method === 'POST');
      return jsonResponse(result, result.status || 200);
    } catch (error) {
      console.error('Growth feature failed', { path: url.pathname, message: error?.message });
      return jsonResponse({ error: 'This section is temporarily unavailable. Please try again later.' }, 503);
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
    const rewards = (await env.DB.prepare('SELECT days, created_at FROM referral_rewards WHERE user_id = ? ORDER BY created_at, referral_id').bind(user.id).all()).results || [];
    const bonusDays = rewards.reduce((sum, row) => sum + Number(row.days), 0);
    const firstConfirmed = user.team_id ? await env.DB.prepare(
      `SELECT MIN(COALESCE(confirmed_at, created_at)) AS first_confirmed_at
       FROM reposts WHERE team_id = ? AND status = 'confirmed'`
    ).bind(user.team_id).first() : null;
    const hasConfirmedRepost = !!firstConfirmed?.first_confirmed_at;
    return jsonResponse({
      display_status: 'proof_of_concept_free',
      access_mode: ACCESS_MODE,
      payment_required: false,
      paid_enrollment_optional: true,
      success_target_percent: SUCCESS_TARGET_PERCENT,
      commercial_limits: { sources: null, members: null, reposts: null, features: null },
      trial_days: 0,
      referral_bonus_days: bonusDays,
      trial_started_at: null,
      trial_ends_at: null,
      days_remaining: null,
      has_confirmed_repost: hasConfirmedRepost,
      first_confirmed_repost_at: firstConfirmed?.first_confirmed_at || null,
      extension_policy: 'Free access for all accounts during proof-of-concept testing, with no trial expiry or subscription limits. Our target is 75% LinkedIn-confirmed repost success. Paid enrollment remains optional; reaching the target does not automatically enable charges or restrictions.',
      checkout_url: `${STRIPE_CHECKOUT_URL}?client_reference_id=${user.id}&prefilled_email=${encodeURIComponent(user.email || '')}`,
      enforcement: 'disabled_for_proof_of_concept',
      note: 'Optional paid enrollment is retained for later use. Enrollment is not required to use any application feature.'
    });
  }

  if (url.pathname === '/api/team' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    if (!user.team_id) return jsonResponse({ members: [] });
    const members = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE team_id = ?').bind(user.team_id).all();
    return jsonResponse({ members: members.results });
  }

  if (url.pathname === '/api/collections' && request.method === 'GET') {
    const user = await getUser(request, env) || await getExtensionUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const rows = await env.DB.prepare(
      'SELECT id, name, description, keywords, hashtags, exclude_keywords, mode, language, max_post_age_days, min_relevance, action, enabled, created_at, updated_at FROM collections WHERE team_id = ? ORDER BY created_at DESC'
    ).bind(user.team_id).all();
    const collections = (rows.results || []).map(row => ({
      ...row,
      keywords: JSON.parse(row.keywords || '[]'),
      hashtags: JSON.parse(row.hashtags || '[]'),
      exclude_keywords: JSON.parse(row.exclude_keywords || '[]')
    }));
    return jsonResponse({ collections });
  }

  if (url.pathname === '/api/collections' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    const cleanList = (value, hash = false) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/))
      .map(item => String(item).trim().replace(hash ? /^#+/ : /^$/, ''))
      .filter(Boolean))].slice(0, 50);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2) return jsonResponse({ error: 'Collection name is required' }, 400);
    const keywords = cleanList(body.keywords);
    const hashtags = cleanList(body.hashtags, true);
    if (!keywords.length && !hashtags.length) return jsonResponse({ error: 'Add at least one keyword or hashtag' }, 400);
    const exclude = cleanList(body.exclude_keywords);
    const mode = ['exact', 'broad', 'ai'].includes(body.mode) ? body.mode : 'broad';
    const action = ['suggest', 'auto'].includes(body.action) ? body.action : 'suggest';
    const minRelevance = Math.max(0, Math.min(100, Number(body.min_relevance) || 75));
    const maxAge = Math.max(1, Math.min(30, Number(body.max_post_age_days) || 3));
    const language = String(body.language || 'any').toLowerCase().slice(0, 12);
    const result = await env.DB.prepare(
      'INSERT INTO collections (team_id, name, description, keywords, hashtags, exclude_keywords, mode, language, max_post_age_days, min_relevance, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.team_id, name, String(body.description || '').trim().slice(0, 500), JSON.stringify(keywords), JSON.stringify(hashtags), JSON.stringify(exclude), mode, language, maxAge, minRelevance, action).run();
    return jsonResponse({ success: true, id: result.meta.last_row_id }, 201);
  }

  if (url.pathname === '/api/collections/suggestions' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    const seeds = [...new Set((Array.isArray(body.keywords) ? body.keywords : String(body.keywords || '').split(/[\n,;]+/)).map(x => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
    const expansions = {
      ai: ['artificial intelligence', 'generative ai', 'machine learning', 'automation'],
      biotech: ['biotechnology', 'life sciences', 'clinical trials', 'drug discovery'],
      solar: ['solar energy', 'renewable energy', 'clean energy', 'solar infrastructure'],
      legal: ['legal tech', 'law firm', 'legal innovation', 'legal services'],
      marketing: ['content marketing', 'brand awareness', 'social media', 'demand generation'],
      cybersecurity: ['cyber security', 'information security', 'data protection', 'security operations']
    };
    const suggested = [];
    for (const seed of seeds) {
      suggested.push(seed);
      for (const [key, values] of Object.entries(expansions)) if (seed.includes(key) || key.includes(seed)) suggested.push(...values);
      if (seed.split(/\s+/).length > 1) suggested.push(seed.replace(/\s+/g, '-'));
    }
    const keywords = [...new Set(suggested)].slice(0, 20);
    const hashtags = [...new Set(keywords.map(x => x.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')).filter(x => x.length >= 3))].slice(0, 15);
    return jsonResponse({ keywords, hashtags, source: 'nexashare-topic-expansion' });
  }

  const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
  if (collectionMatch && request.method === 'PATCH') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    if (typeof body.enabled !== 'boolean') return jsonResponse({ error: 'Provide enabled state' }, 400);
    const result = await env.DB.prepare('UPDATE collections SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND team_id = ?')
      .bind(body.enabled ? 1 : 0, Number(collectionMatch[1]), user.team_id).run();
    if (!result.meta.changes) return jsonResponse({ error: 'Collection not found' }, 404);
    return jsonResponse({ success: true });
  }

  if (collectionMatch && request.method === 'DELETE') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const result = await env.DB.prepare('DELETE FROM collections WHERE id = ? AND team_id = ?').bind(Number(collectionMatch[1]), user.team_id).run();
    if (!result.meta.changes) return jsonResponse({ error: 'Collection not found' }, 404);
    return jsonResponse({ success: true });
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
      const outcomeId = typeof outcome.outcomeId === 'string' ? outcome.outcomeId.slice(0, 100) : null;
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO reposts
         (user_id, team_id, original_post_url, repost_url, post_text, hashtags, status, company_name, detail, attempted_at, confirmed_at, outcome_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id, user.team_id, postUrl,
        typeof outcome.repostUrl === 'string' && outcome.repostUrl.startsWith('https://www.linkedin.com/') ? outcome.repostUrl.slice(0, 1000) : null,
        String(outcome.postTextSnippet || '').slice(0, 2000),
        JSON.stringify(extractHashtags(outcome.postTextSnippet)),
        status, String(outcome.companyName || '').slice(0, 100), String(outcome.detail || '').slice(0, 500),
        outcome.attemptedAt || new Date().toISOString(), status === 'confirmed' ? (outcome.confirmedAt || new Date().toISOString()) : null,
        outcomeId
      ).run();
      if (!inserted.meta?.changes) continue;
      await recordDeliveryOutcome(env.DB, {
        teamId: user.team_id,
        userId: user.id,
        outcome: { ...outcome, status, postUrl }
      });
      accepted++;
    }
    const reportedVersion = typeof body.extensionVersion === 'string' ? body.extensionVersion : null;
    await touchExtensionToken(request, env, reportedVersion);
    try {
      await env.DB.prepare(
        `INSERT INTO extension_runs (user_id, team_id, extension_version, trigger_source, outcomes)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        user.id, user.team_id, reportedVersion,
        String(body.trigger || 'ingest').slice(0, 40), accepted
      ).run();
    } catch (error) {
      console.error('extension_runs insert failed', { message: error?.message });
    }
    return jsonResponse({ success: true, accepted });
  }

  // The dashboard reports the build it can see in this browser, so an outdated
  // install is visible even on a day the extension never completes a run.
  if (url.pathname === '/api/extension/seen' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json().catch(() => ({}));
    const version = typeof body.version === 'string' ? body.version.slice(0, 20) : null;
    if (!version) return jsonResponse({ error: 'A version is required' }, 400);
    await env.DB.prepare(
      `UPDATE extension_tokens
       SET last_seen_at = datetime('now'), extension_version = ?
       WHERE user_id = ? AND revoked_at IS NULL`
    ).bind(version, user.id).run();
    return jsonResponse({ success: true, current: CURRENT_EXTENSION_VERSION, installed: version });
  }

  if (url.pathname === '/api/extension/commands/next' && request.method === 'GET') {
    const user = await getExtensionUser(request, env);
    if (!user) return jsonResponse({ error: 'Invalid extension token' }, 401);
    const command = await env.DB.prepare(
      "SELECT id, command, payload, created_at FROM extension_commands WHERE user_id = ? AND status = 'pending' ORDER BY id LIMIT 1"
    ).bind(user.id).first();
    if (!command) return jsonResponse({ command: null });
    const claimed = await env.DB.prepare(
      "UPDATE extension_commands SET status = 'claimed', claimed_at = datetime('now') WHERE id = ? AND status = 'pending'"
    ).bind(command.id).run();
    if (!claimed.meta?.changes) return jsonResponse({ command: null });
    let payload = null;
    try { payload = command.payload ? JSON.parse(command.payload) : null; } catch (_) {}
    return jsonResponse({ command: { ...command, payload } });
  }

  const completeCommand = url.pathname.match(/^\/api\/extension\/commands\/(\d+)\/complete$/);
  if (completeCommand && request.method === 'POST') {
    const user = await getExtensionUser(request, env);
    if (!user) return jsonResponse({ error: 'Invalid extension token' }, 401);
    const body = await request.json().catch(() => ({}));
    const status = body.status === 'failed' ? 'failed' : 'completed';
    const result = JSON.stringify(body.result ?? null).slice(0, 20000);
    const updated = await env.DB.prepare(
      "UPDATE extension_commands SET status = ?, completed_at = datetime('now'), result = ? WHERE id = ? AND user_id = ? AND status = 'claimed'"
    ).bind(status, result, Number(completeCommand[1]), user.id).run();
    return jsonResponse({ success: Boolean(updated.meta?.changes) }, updated.meta?.changes ? 200 : 409);
  }

  if (url.pathname === '/api/extension/diagnostics' && request.method === 'POST') {
    const user = await getExtensionUser(request, env);
    if (!user) return jsonResponse({ error: 'Invalid extension token' }, 401);
    const body = await request.json().catch(() => ({}));
    const traceId = String(body.traceId || '').slice(0, 100);
    const stage = String(body.stage || '').slice(0, 80);
    if (!traceId || !stage) return jsonResponse({ error: 'traceId and stage are required' }, 400);
    const state = body.state && typeof body.state === 'object' ? body.state : null;
    await env.DB.prepare(
      "INSERT INTO extension_diagnostics (trace_id, user_id, team_id, stage, url, metadata, state) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(traceId, user.id, user.team_id, stage, String(state?.url || '').slice(0, 1000),
      JSON.stringify(body.metadata || {}).slice(0, 20000), JSON.stringify(state || {}).slice(0, 50000)).run();
    return jsonResponse({ success: true });
  }

  if (url.pathname === '/api/extension/deliveries/processing' && request.method === 'POST') {
    const user = await getExtensionUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Invalid extension token' }, 401);
    const body = await request.json();
    const postUrl = String(body.postUrl || '').slice(0, 1000);
    if (!postUrl.startsWith('https://www.linkedin.com/')) return jsonResponse({ error: 'A LinkedIn post URL is required' }, 400);
    await markDeliveryProcessing(env.DB, { teamId: user.team_id, userId: user.id, postUrl });
    return jsonResponse({ success: true });
  }

  if (url.pathname === '/api/campaign-health' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    return jsonResponse({ health: await getCampaignHealth(env.DB, user.team_id) });
  }

  if (url.pathname === '/api/delivery-jobs/retry' && request.method === 'POST') {
    const user = await getUser(request, env);
    if (!user || !user.team_id) return jsonResponse({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return jsonResponse({ error: 'A delivery job ID is required' }, 400);
    const result = await env.DB.prepare(
      `UPDATE delivery_jobs SET status = 'scheduled', next_retry_at = datetime('now'),
       failure_code = NULL, failure_detail = NULL, completed_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND team_id = ? AND status = 'failed' AND attempt_count < max_attempts`
    ).bind(id, user.team_id).run();
    if (!result.meta.changes) return jsonResponse({ error: 'Delivery is not eligible for retry' }, 409);
    return jsonResponse({ success: true });
  }

  if (url.pathname === '/api/hashtags' && request.method === 'GET') {
    const user = await getUser(request, env);
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const rows = await env.DB.prepare(
      `SELECT post_text, hashtags, company_name, attempted_at, created_at
       FROM reposts
       WHERE user_id = ? AND status = 'confirmed'
       ORDER BY datetime(COALESCE(attempted_at, created_at)) DESC
       LIMIT 1000`
    ).bind(user.id).all();

    const ranked = new Map();
    const bySource = new Map();
    let postsWithHashtags = 0;
    for (const row of rows.results || []) {
      let tags = [];
      try { tags = JSON.parse(row.hashtags || '[]'); } catch (_) { tags = []; }
      if (!Array.isArray(tags) || !tags.length) tags = extractHashtags(row.post_text);
      tags = [...new Set(tags.map(tag => String(tag || '').replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))];
      const sourceName = String(row.company_name || 'Unknown source').trim() || 'Unknown source';
      const source = bySource.get(sourceName) || { source: sourceName, confirmed_posts: 0, posts_with_hashtags: 0, tags: new Map(), last_seen_at: null };
      source.confirmed_posts++;
      const seenAt = row.attempted_at || row.created_at || null;
      if (seenAt && (!source.last_seen_at || new Date(seenAt) > new Date(source.last_seen_at))) source.last_seen_at = seenAt;
      if (!tags.length) {
        bySource.set(sourceName, source);
        continue;
      }
      postsWithHashtags++;
      source.posts_with_hashtags++;
      for (const tag of tags) {
        const sourceTag = source.tags.get(tag) || { hashtag: tag, uses: 0, last_seen_at: null };
        sourceTag.uses++;
        if (seenAt && (!sourceTag.last_seen_at || new Date(seenAt) > new Date(sourceTag.last_seen_at))) sourceTag.last_seen_at = seenAt;
        source.tags.set(tag, sourceTag);
        const item = ranked.get(tag) || { hashtag: tag, uses: 0, companies: new Set(), last_seen_at: null };
        item.uses++;
        if (row.company_name) item.companies.add(row.company_name);
        if (seenAt && (!item.last_seen_at || new Date(seenAt) > new Date(item.last_seen_at))) item.last_seen_at = seenAt;
        ranked.set(tag, item);
      }
      bySource.set(sourceName, source);
    }

    const confirmedPosts = (rows.results || []).length;
    const hashtags = [...ranked.values()]
      .map(item => ({
        hashtag: item.hashtag,
        uses: item.uses,
        share_of_confirmed_posts: confirmedPosts ? Math.round((item.uses / confirmedPosts) * 1000) / 10 : 0,
        companies: [...item.companies].sort(),
        last_seen_at: item.last_seen_at
      }))
      .sort((a, b) => b.uses - a.uses || String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')) || a.hashtag.localeCompare(b.hashtag))
      .slice(0, 50);

    const sources = [...bySource.values()]
      .map(source => ({
        source: source.source,
        confirmed_posts: source.confirmed_posts,
        posts_with_hashtags: source.posts_with_hashtags,
        unique_hashtags: source.tags.size,
        coverage_pct: source.confirmed_posts ? Math.round((source.posts_with_hashtags / source.confirmed_posts) * 1000) / 10 : 0,
        last_seen_at: source.last_seen_at,
        hashtags: [...source.tags.values()]
          .map(tag => ({
            hashtag: tag.hashtag,
            uses: tag.uses,
            share_of_source_posts: source.confirmed_posts ? Math.round((tag.uses / source.confirmed_posts) * 1000) / 10 : 0,
            last_seen_at: tag.last_seen_at
          }))
          .sort((a, b) => b.uses - a.uses || String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')) || a.hashtag.localeCompare(b.hashtag))
          .slice(0, 20)
      }))
      .sort((a, b) => b.confirmed_posts - a.confirmed_posts || b.posts_with_hashtags - a.posts_with_hashtags || a.source.localeCompare(b.source));

    return jsonResponse({
      confirmed_posts: confirmedPosts,
      posts_with_hashtags: postsWithHashtags,
      unique_hashtags: ranked.size,
      coverage_pct: confirmedPosts ? Math.round((postsWithHashtags / confirmedPosts) * 1000) / 10 : 0,
      hashtags,
      sources
    });
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

  // Platform-wide extension report. Read-only preview plus an on-demand send,
  // guarded by ADMIN_REPORT_KEY so it is never reachable by a normal account.
  if (url.pathname === '/api/admin/daily-report') {
    if (!env.ADMIN_REPORT_KEY) return jsonResponse({ error: 'Admin reporting is not configured' }, 404);
    const presented = request.headers.get('X-Admin-Report-Key') || url.searchParams.get('key') || '';
    if (presented !== env.ADMIN_REPORT_KEY) return jsonResponse({ error: 'Not authorised' }, 401);

    if (request.method === 'POST') {
      const result = await sendAdminDailyReport(env, { force: url.searchParams.get('force') === '1' });
      return jsonResponse({ recipient: reportRecipients(env), ...result });
    }

    if (request.method === 'GET') {
      const data = await collectAdminReportData(env.DB);
      const preview = buildAdminReportEmail(data, { to: reportRecipients(env)[0] });
      if (url.searchParams.get('format') === 'html') {
        return new Response(preview.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      return jsonResponse({ subject: preview.subject, to: preview.to, from: preview.from, text: preview.text, data });
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/r/')) {
      const code = referralCode(url.pathname.slice(3));
      if (!code || !await env.DB.prepare('SELECT user_id FROM referral_codes WHERE code = ?').bind(code).first()) return new Response('Referral link not found', { status: 404 });
      return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN}/register.html`, 'Set-Cookie': setCookie('nexashare_ref', code, 86400 * 30), 'Cache-Control': 'no-store' } });
    }
    if (url.pathname.startsWith('/api/')) return handleAPI(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([sendMissingCompanyReminders(env), sendDailyRepostReports(env)]));
  }
};
