import app from './index.js';

const APP_ORIGIN = 'https://nexashare.com';
const DAILY_REPORT_FROM = 'NexaShare <nexashare@gershon.ai>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

function normalizeStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function buildDailyReport(user, rows) {
  const confirmed = rows.filter(row => row.status === 'confirmed');
  const failed = rows.filter(row => row.status === 'failed');
  const skipped = rows.filter(row => row.status === 'skipped' || row.status === 'already_reposted');
  const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const dashboardUrl = `${APP_ORIGIN}/dashboard.html#reposts`;
  const summary = `${confirmed.length} successful repost${confirmed.length === 1 ? '' : 's'}, ${failed.length} failure${failed.length === 1 ? '' : 's'}, and ${skipped.length} skipped/already reposted in the last 24 hours.`;

  const textRows = rows.length
    ? rows.slice(0, 50).map(row => {
        const source = row.company_name || 'LinkedIn source';
        const detail = row.detail ? ` — ${row.detail}` : '';
        const repost = row.repost_url ? `\nRepost: ${row.repost_url}` : '';
        return `${source}: ${normalizeStatus(row.status)}${detail}\nOriginal: ${row.original_post_url}${repost}`;
      }).join('\n\n')
    : 'No repost outcomes were recorded in the last 24 hours.';

  const itemHtml = rows.length
    ? rows.slice(0, 50).map(row => {
        const isFailure = row.status === 'failed';
        const outcome = normalizeStatus(row.status);
        const detail = row.detail ? `<div style="margin-top:5px;font-size:12px;color:${isFailure ? '#b42318' : '#667085'}">${escapeHtml(row.detail)}</div>` : '';
        const links = `<a href="${escapeHtml(row.original_post_url)}">Original</a>${row.repost_url ? ` · <a href="${escapeHtml(row.repost_url)}">Repost</a>` : ''}`;
        return `<tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top">${escapeHtml(row.company_name || 'LinkedIn source')}</td><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-weight:700;color:${isFailure ? '#b42318' : '#344054'}">${escapeHtml(outcome)}${detail}</td><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top">${links}</td></tr>`;
      }).join('')
    : '<tr><td colspan="3" style="padding:18px;color:#667085">No repost outcomes were recorded in the last 24 hours. NexaShare is still monitoring your configured sources.</td></tr>';

  return {
    to: user.email,
    from: DAILY_REPORT_FROM,
    subject: `NexaShare daily report: ${confirmed.length} successful, ${failed.length} failed`,
    text: `Hi ${firstName},\n\n${summary}\n\n${textRows}\n\nReview your full repost history: ${dashboardUrl}`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:720px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#0a66c2;color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">NexaShare daily activity report</div><div style="margin-top:7px">${escapeHtml(summary)}</div></td></tr><tr><td style="padding:26px"><p style="font-size:16px">Hi ${escapeHtml(firstName)},</p><table width="100%" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" style="padding:10px;background:#f8fafc">Source</th><th align="left" style="padding:10px;background:#f8fafc">Outcome / reason</th><th align="left" style="padding:10px;background:#f8fafc">Links</th></tr></thead><tbody>${itemHtml}</tbody></table><p style="text-align:center;margin:26px 0 4px"><a href="${dashboardUrl}" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px">Review repost history</a></p><p style="font-size:12px;color:#667085">A repost is counted as successful only after LinkedIn confirmation. Failure reasons are shown when the extension reported one.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendWithResend(env, message) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new Error(String(payload.message || `Resend returned HTTP ${response.status}`).slice(0, 500));
  }
  return payload.id;
}

async function sendDailyUserReports(env) {
  if (!env.RESEND_API_KEY) {
    console.log('Daily user reports skipped: RESEND_API_KEY is not configured.');
    return { sent: 0, skipped: 'resend_not_configured' };
  }

  const users = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.team_id
     FROM users u
     WHERE u.email IS NOT NULL
       AND trim(u.email) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM daily_reports d
         WHERE d.user_id = u.id AND d.report_date = date('now')
       )
     ORDER BY u.id
     LIMIT 1000`
  ).all();

  let sent = 0;
  let failed = 0;

  for (const user of users.results || []) {
    const outcomes = await env.DB.prepare(
      `SELECT company_name, original_post_url, repost_url, post_text, status, detail, attempted_at
       FROM reposts
       WHERE user_id = ?
         AND datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-1 day')
       ORDER BY datetime(COALESCE(attempted_at, created_at)) DESC
       LIMIT 100`
    ).bind(user.id).all();

    try {
      const messageId = await sendWithResend(env, buildDailyReport(user, outcomes.results || []));
      await env.DB.prepare(
        `INSERT INTO daily_reports (user_id, report_date, status, outcome_count, provider_message_id, sent_at)
         VALUES (?, date('now'), 'sent', ?, ?, datetime('now'))`
      ).bind(user.id, (outcomes.results || []).length, messageId).run();
      sent++;
    } catch (error) {
      failed++;
      console.error('Daily user report failed', {
        userId: user.id,
        email: user.email,
        message: error?.message
      });
    }
  }

  return { sent, failed, eligible: (users.results || []).length };
}

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDailyUserReports(env));
  }
};
