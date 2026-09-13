import app from './index.js';
import { sendAdminDailyReport } from './admin-report.js';
import { sendSundayReports } from './weekly-report.js';

const APP_ORIGIN = 'https://nexashare.com';
const DAILY_REPORT_FROM = 'NexaShare <nexashare@gershon.ai>';
export const CURRENT_EXTENSION_VERSION = '1.2.18';

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

// Reduce a day's repost rows to the numbers the progress table compares.
export function summarize(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const confirmed = list.filter(row => row.status === 'confirmed').length;
  const failed = list.filter(row => row.status === 'failed').length;
  const skipped = list.filter(row => row.status === 'skipped' || row.status === 'already_reposted').length;
  const companies = new Set(list.map(row => row.company_name).filter(Boolean)).size;
  return {
    processed: list.length,
    confirmed,
    failed,
    skipped,
    companies,
    // Confirmation rate is measured against attempts, not against skips: a post
    // that was already reposted was never an attempt.
    rate: (confirmed + failed) ? Math.round((confirmed / (confirmed + failed)) * 100) : null
  };
}

function delta(today, yesterday) {
  if (today === null || yesterday === null) return '';
  const diff = today - yesterday;
  if (!diff) return 'no change';
  return `${diff > 0 ? '+' : ''}${diff}`;
}

function deltaColour(today, yesterday, higherIsBetter = true) {
  if (today === null || yesterday === null || today === yesterday) return '#667085';
  const better = today > yesterday ? higherIsBetter : !higherIsBetter;
  return better ? '#067647' : '#b42318';
}

export function buildDailyReport(user, rows, previousRows, signals = {}) {
  const today = summarize(rows);
  const before = summarize(previousRows);
  const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const dashboardUrl = `${APP_ORIGIN}/dashboard.html#reposts`;

  const ranYesterday = Boolean(signals.ranYesterday);
  const installedVersion = signals.extensionVersion || null;
  const outdated = Boolean(installedVersion) && installedVersion !== CURRENT_EXTENSION_VERSION;
  const neverSeen = !installedVersion;

  const summary = ranYesterday
    ? `${today.confirmed} successful repost${today.confirmed === 1 ? '' : 's'}, ${today.failed} failure${today.failed === 1 ? '' : 's'}, and ${today.skipped} skipped/already reposted in the last 24 hours.`
    : 'The daily job did not run yesterday. The figures below are not a quiet day — they are a missing day.';

  // ---- alarm banners -------------------------------------------------------
  const banners = [];
  if (!ranYesterday) {
    banners.push(`<tr><td style="padding:0 26px 18px"><div style="background:#fef3f2;border-left:5px solid #b42318;border-radius:8px;padding:16px 18px"><div style="font-size:17px;font-weight:800;color:#7a271a">THE DAILY JOB DID NOT RUN</div><div style="margin-top:7px;font-size:14px;line-height:1.6;color:#7a271a">NexaShare recorded no extension run for your account yesterday, so nothing was checked and nothing could be reposted. This is not a slow day &mdash; the automation did not execute. Open the dashboard, confirm Chrome is running with the extension installed and signed in to LinkedIn, then use <b>Run test now</b>.</div></div></td></tr>`);
  }
  if (outdated) {
    banners.push(`<tr><td style="padding:0 26px 18px"><div style="background:#fffaeb;border-left:5px solid #b54708;border-radius:8px;padding:16px 18px"><div style="font-size:16px;font-weight:800;color:#7a2e0e">Outdated extension installed</div><div style="margin-top:7px;font-size:14px;line-height:1.6;color:#7a2e0e">This browser is running v${escapeHtml(installedVersion)}; the current release is <b>v${CURRENT_EXTENSION_VERSION}</b>. Older builds miss posts and can fail to confirm reposts. Download the current package from the dashboard and reload it in Chrome.</div></div></td></tr>`);
  }
  if (neverSeen) {
    banners.push(`<tr><td style="padding:0 26px 18px"><div style="background:#fffaeb;border-left:5px solid #b54708;border-radius:8px;padding:16px 18px"><div style="font-size:16px;font-weight:800;color:#7a2e0e">No extension has reported in</div><div style="margin-top:7px;font-size:14px;line-height:1.6;color:#7a2e0e">NexaShare has never received a version signal from a browser on your account, so it cannot tell whether the extension is installed. Open the dashboard with Chrome to register it.</div></div></td></tr>`);
  }

  // ---- progress table ------------------------------------------------------
  const metrics = [
    ['Posts processed', today.processed, before.processed, true],
    ['Confirmed reposts', today.confirmed, before.confirmed, true],
    ['Failed', today.failed, before.failed, false],
    ['Skipped / already reposted', today.skipped, before.skipped, true],
    ['Companies covered', today.companies, before.companies, true]
  ];
  const metricRows = metrics.map(([label, now, prev, higherIsBetter]) => `<tr><td style="padding:9px 11px;border-bottom:1px solid #eef2f1">${label}</td><td align="center" style="padding:9px 11px;border-bottom:1px solid #eef2f1;font-weight:800">${now}</td><td align="center" style="padding:9px 11px;border-bottom:1px solid #eef2f1;color:#667085">${prev}</td><td align="center" style="padding:9px 11px;border-bottom:1px solid #eef2f1;font-weight:700;color:${deltaColour(now, prev, higherIsBetter)}">${delta(now, prev)}</td></tr>`).join('');
  const rateRow = `<tr><td style="padding:9px 11px">Confirmation rate</td><td align="center" style="padding:9px 11px;font-weight:800">${today.rate === null ? '&mdash;' : today.rate + '%'}</td><td align="center" style="padding:9px 11px;color:#667085">${before.rate === null ? '&mdash;' : before.rate + '%'}</td><td align="center" style="padding:9px 11px;font-weight:700;color:${deltaColour(today.rate, before.rate, true)}">${today.rate === null || before.rate === null ? '' : delta(today.rate, before.rate) + (delta(today.rate, before.rate) === 'no change' ? '' : ' pts')}</td></tr>`;

  const progressTable = `<tr><td style="padding:0 26px 22px"><div style="font-size:15px;font-weight:800;color:#12211d;margin-bottom:9px">Yesterday vs the day before</div><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:13px"><thead><tr><th align="left" style="padding:8px 11px;background:#f8fafc;color:#667085">Metric</th><th align="center" style="padding:8px 11px;background:#f8fafc;color:#667085">Yesterday</th><th align="center" style="padding:8px 11px;background:#f8fafc;color:#667085">Day before</th><th align="center" style="padding:8px 11px;background:#f8fafc;color:#667085">Change</th></tr></thead><tbody>${metricRows}${rateRow}</tbody></table></td></tr>`;

  // ---- per-outcome detail --------------------------------------------------
  const itemHtml = rows.length
    ? rows.slice(0, 50).map(row => {
        const isFailure = row.status === 'failed';
        const outcome = normalizeStatus(row.status);
        const detail = row.detail ? `<div style="margin-top:5px;font-size:12px;color:${isFailure ? '#b42318' : '#667085'}">${escapeHtml(row.detail)}</div>` : '';
        const links = `<a href="${escapeHtml(row.original_post_url)}">Original</a>${row.repost_url ? ` &middot; <a href="${escapeHtml(row.repost_url)}">Repost</a>` : ''}`;
        return `<tr><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top">${escapeHtml(row.company_name || 'LinkedIn source')}</td><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-weight:700;color:${isFailure ? '#b42318' : '#344054'}">${escapeHtml(outcome)}${detail}</td><td style="padding:11px;border-bottom:1px solid #e5e7eb;vertical-align:top">${links}</td></tr>`;
      }).join('')
    : `<tr><td colspan="3" style="padding:18px;color:#667085">${ranYesterday ? 'No repost outcomes were recorded in the last 24 hours. NexaShare is still monitoring your configured sources.' : 'No outcomes, because the job did not run. See the alarm above.'}</td></tr>`;

  // ---- plain text ----------------------------------------------------------
  const textAlarm = ranYesterday ? '' : 'ALARM: THE DAILY JOB DID NOT RUN YESTERDAY. Nothing was checked and nothing was reposted.\n\n';
  const textOutdated = outdated ? `WARNING: this browser runs extension v${installedVersion}; current is v${CURRENT_EXTENSION_VERSION}.\n\n` : '';
  const textProgress = `Yesterday vs the day before\n` + metrics.map(([label, now, prev]) => `  ${label}: ${now} (was ${prev})`).join('\n') +
    `\n  Confirmation rate: ${today.rate === null ? 'n/a' : today.rate + '%'} (was ${before.rate === null ? 'n/a' : before.rate + '%'})\n\n`;
  const textRows = rows.length
    ? rows.slice(0, 50).map(row => {
        const source = row.company_name || 'LinkedIn source';
        const detail = row.detail ? ` — ${row.detail}` : '';
        const repost = row.repost_url ? `\nRepost: ${row.repost_url}` : '';
        return `${source}: ${normalizeStatus(row.status)}${detail}\nOriginal: ${row.original_post_url}${repost}`;
      }).join('\n\n')
    : 'No repost outcomes were recorded in the last 24 hours.';

  const subjectPrefix = ranYesterday ? '' : 'ACTION NEEDED — job did not run · ';

  return {
    to: user.email,
    from: DAILY_REPORT_FROM,
    subject: `${subjectPrefix}NexaShare daily report: ${today.confirmed} successful, ${today.failed} failed`,
    text: `Hi ${firstName},\n\n${textAlarm}${textOutdated}${summary}\n\n${textProgress}${textRows}\n\nReview your full repost history: ${dashboardUrl}`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:720px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:${ranYesterday ? '#0a66c2' : '#b42318'};color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">NexaShare daily activity report</div><div style="margin-top:7px">${escapeHtml(summary)}</div></td></tr>${banners.join('')}${progressTable}<tr><td style="padding:0 26px 26px"><p style="font-size:16px">Hi ${escapeHtml(firstName)},</p><table width="100%" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" style="padding:10px;background:#f8fafc">Source</th><th align="left" style="padding:10px;background:#f8fafc">Outcome / reason</th><th align="left" style="padding:10px;background:#f8fafc">Links</th></tr></thead><tbody>${itemHtml}</tbody></table><p style="text-align:center;margin:26px 0 4px"><a href="${dashboardUrl}" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px">Review repost history</a></p><p style="font-size:12px;color:#667085">A repost is counted as successful only after LinkedIn confirmation. Failure reasons are shown when the extension reported one. Confirmation rate is measured against attempts, so skipped and already-reposted items are excluded from it.</p></td></tr></table></td></tr></table></body></html>`
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
    const dayRows = async offset => (await env.DB.prepare(
      `SELECT company_name, original_post_url, repost_url, post_text, status, detail, attempted_at
       FROM reposts
       WHERE user_id = ?
         AND date(COALESCE(attempted_at, created_at)) = date('now', ?)
       ORDER BY datetime(COALESCE(attempted_at, created_at)) DESC
       LIMIT 100`
    ).bind(user.id, offset).all()).results || [];

    const outcomes = await dayRows('-1 day');
    const previous = await dayRows('-2 day');

    // Did the extension actually run yesterday? Without this, a silent failure
    // is indistinguishable from a genuinely quiet day.
    const run = await env.DB.prepare(
      `SELECT COUNT(*) AS runs FROM extension_runs
       WHERE user_id = ? AND date(created_at) = date('now', '-1 day')`
    ).bind(user.id).first().catch(() => null);

    const token = await env.DB.prepare(
      `SELECT extension_version, last_seen_at FROM extension_tokens
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1`
    ).bind(user.id).first().catch(() => null);

    const signals = {
      ranYesterday: Number(run?.runs || 0) > 0,
      extensionVersion: token?.extension_version || null,
      lastSeenAt: token?.last_seen_at || null
    };

    try {
      const messageId = await sendWithResend(env, buildDailyReport(user, outcomes, previous, signals));
      await env.DB.prepare(
        `INSERT INTO daily_reports (user_id, report_date, status, outcome_count, provider_message_id, sent_at)
         VALUES (?, date('now'), 'sent', ?, ?, datetime('now'))`
      ).bind(user.id, outcomes.length, messageId).run();
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
  async scheduled(event, env, ctx) {
    const scheduledDate = event?.scheduledTime ? new Date(event.scheduledTime) : new Date();
    ctx.waitUntil(Promise.all([
      sendDailyUserReports(env),
      sendAdminDailyReport(env),
      sendSundayReports(env, CURRENT_EXTENSION_VERSION, { date: scheduledDate })
    ]));
  }
};
