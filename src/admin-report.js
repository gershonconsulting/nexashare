// Daily operations report for the NexaShare Chrome extension.
//
// This is a platform feature, not an external job: the Worker cron collects the
// last 24 hours of extension activity across every team and emails a single
// digest to the Gershon Consulting reporting inbox.
//
// Subject convention (Gershon platform reports):
//   "NexaShare Extension Report — September 3, 2026"

import { DEFAULT_REPORT_RECIPIENT, readReportRecipient } from './report-settings.js';

const APP_ORIGIN = 'https://nexashare.com';

export const ADMIN_REPORT_FROM = 'NexaShare <nexashare@gershon.ai>';
export const ADMIN_REPORT_TO = DEFAULT_REPORT_RECIPIENT;

const REPOST_STATUSES = ['confirmed', 'failed', 'skipped', 'already_reposted'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

function humanStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

export function formatReportDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// D1 throws when a table is missing (a migration that has not run yet, a
// sandbox database). A single missing table must never cost us the whole
// report, so every query degrades to a fallback value.
async function safe(promiseFactory, fallback) {
  try {
    const value = await promiseFactory();
    return value ?? fallback;
  } catch (error) {
    console.error('Admin report query failed', { message: error?.message });
    return fallback;
  }
}

function countsByStatus(rows) {
  const counts = Object.fromEntries(REPOST_STATUSES.map(status => [status, 0]));
  let other = 0;
  for (const row of rows || []) {
    const status = String(row.status || '');
    if (status in counts) counts[status] += Number(row.count || 0);
    else other += Number(row.count || 0);
  }
  counts.other = other;
  counts.total = REPOST_STATUSES.reduce((sum, status) => sum + counts[status], 0) + other;
  return counts;
}

export async function collectAdminReportData(db) {
  const all = async (sql, ...binds) => safe(async () => {
    const statement = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    const result = await statement.all();
    return result?.results || [];
  }, []);
  const first = async (sql, ...binds) => safe(async () => {
    const statement = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    return await statement.first();
  }, null);

  const [
    todayRows,
    yesterdayRows,
    weekRows,
    activity,
    failureReasons,
    topSources,
    teamRows,
    recent,
    users,
    installs,
    silentInstalls,
    sources,
    deliveryRows,
    deliveryFailures,
    retryQueue,
    lifetime,
    userReports
  ] = await Promise.all([
    all(`SELECT status, COUNT(*) AS count FROM reposts
         WHERE datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-1 day')
         GROUP BY status`),
    all(`SELECT status, COUNT(*) AS count FROM reposts
         WHERE datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-2 day')
           AND datetime(COALESCE(attempted_at, created_at)) < datetime('now', '-1 day')
         GROUP BY status`),
    all(`SELECT status, COUNT(*) AS count FROM reposts
         WHERE datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-7 day')
         GROUP BY status`),
    first(`SELECT COUNT(DISTINCT user_id) AS active_users, COUNT(DISTINCT team_id) AS active_teams
           FROM reposts
           WHERE datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-1 day')`),
    all(`SELECT COALESCE(NULLIF(trim(detail), ''), 'No reason reported by the extension') AS reason,
                COUNT(*) AS count
         FROM reposts
         WHERE status = 'failed'
           AND datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-1 day')
         GROUP BY reason ORDER BY count DESC LIMIT 8`),
    all(`SELECT COALESCE(NULLIF(trim(company_name), ''), 'Unnamed source') AS source,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                COUNT(*) AS attempts
         FROM reposts
         WHERE datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-1 day')
         GROUP BY source ORDER BY attempts DESC LIMIT 10`),
    all(`SELECT COALESCE(NULLIF(trim(t.name), ''), 'Team ' || r.team_id) AS team,
                SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed,
                COUNT(*) AS attempts
         FROM reposts r LEFT JOIN teams t ON t.id = r.team_id
         WHERE datetime(COALESCE(r.attempted_at, r.created_at)) >= datetime('now', '-1 day')
         GROUP BY r.team_id ORDER BY attempts DESC LIMIT 10`),
    all(`SELECT r.company_name, r.original_post_url, r.repost_url, r.status, r.detail,
                COALESCE(r.attempted_at, r.created_at) AS happened_at,
                u.name AS user_name, u.email AS user_email
         FROM reposts r LEFT JOIN users u ON u.id = r.user_id
         WHERE datetime(COALESCE(r.attempted_at, r.created_at)) >= datetime('now', '-1 day')
         ORDER BY datetime(COALESCE(r.attempted_at, r.created_at)) DESC LIMIT 25`),
    first(`SELECT COUNT(*) AS total,
                  SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS new_today,
                  SUM(CASE WHEN datetime(created_at) >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS new_this_week
           FROM users`),
    first(`SELECT COUNT(*) AS connected,
                  SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS connected_today
           FROM extension_tokens WHERE revoked_at IS NULL`),
    all(`SELECT COALESCE(NULLIF(trim(u.name), ''), u.email) AS who, u.email AS email
         FROM extension_tokens et JOIN users u ON u.id = et.user_id
         WHERE et.revoked_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM reposts r
             WHERE r.user_id = et.user_id
               AND datetime(COALESCE(r.attempted_at, r.created_at)) >= datetime('now', '-7 day')
           )
         GROUP BY u.id ORDER BY u.id LIMIT 15`),
    first(`SELECT (SELECT COUNT(*) FROM companies WHERE enabled = 1) AS companies,
                  (SELECT COUNT(*) FROM people WHERE enabled = 1) AS people`),
    all(`SELECT status, COUNT(*) AS count FROM delivery_jobs
         WHERE datetime(updated_at) >= datetime('now', '-1 day')
         GROUP BY status`),
    all(`SELECT COALESCE(NULLIF(trim(failure_code), ''), 'unclassified') AS code, COUNT(*) AS count
         FROM delivery_jobs
         WHERE status = 'failed' AND datetime(updated_at) >= datetime('now', '-1 day')
         GROUP BY code ORDER BY count DESC LIMIT 6`),
    first(`SELECT COUNT(*) AS pending FROM delivery_jobs
           WHERE status IN ('scheduled', 'processing') AND attempt_count > 0`),
    first(`SELECT COUNT(*) AS confirmed FROM reposts WHERE status = 'confirmed'`),
    first(`SELECT COUNT(*) AS sent FROM daily_reports WHERE report_date = date('now')`)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    today: countsByStatus(todayRows),
    yesterday: countsByStatus(yesterdayRows),
    week: countsByStatus(weekRows),
    activeUsers: Number(activity?.active_users || 0),
    activeTeams: Number(activity?.active_teams || 0),
    failureReasons,
    topSources,
    teams: teamRows,
    recent,
    users: {
      total: Number(users?.total || 0),
      newToday: Number(users?.new_today || 0),
      newThisWeek: Number(users?.new_this_week || 0)
    },
    installs: {
      connected: Number(installs?.connected || 0),
      connectedToday: Number(installs?.connected_today || 0)
    },
    silentInstalls,
    sources: {
      companies: Number(sources?.companies || 0),
      people: Number(sources?.people || 0)
    },
    delivery: {
      byStatus: deliveryRows,
      failureCodes: deliveryFailures,
      pendingRetries: Number(retryQueue?.pending || 0)
    },
    lifetimeConfirmed: Number(lifetime?.confirmed || 0),
    userReportsSentToday: Number(userReports?.sent || 0)
  };
}

function delta(current, previous) {
  const difference = current - previous;
  if (!difference) return 'no change vs the day before';
  return `${difference > 0 ? '+' : ''}${difference} vs the day before`;
}

function successRate(counts) {
  const attempted = counts.confirmed + counts.failed;
  if (!attempted) return null;
  return Math.round((counts.confirmed / attempted) * 100);
}

export function buildAdminReportEmail(data, options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const to = options.to || ADMIN_REPORT_TO;
  const dateLabel = formatReportDate(date);
  const today = data.today;
  const rate = successRate(today);
  const headline = today.total
    ? `${today.confirmed} confirmed, ${today.failed} failed, ${today.skipped + today.already_reposted} skipped across ${data.activeUsers} active extension${data.activeUsers === 1 ? '' : 's'}.`
    : 'No extension activity was recorded in the last 24 hours.';

  const metrics = [
    ['Confirmed reposts', today.confirmed, delta(today.confirmed, data.yesterday.confirmed)],
    ['Failed attempts', today.failed, delta(today.failed, data.yesterday.failed)],
    ['Skipped / already reposted', today.skipped + today.already_reposted, ''],
    ['Success rate', rate === null ? 'n/a' : `${rate}%`, 'confirmed ÷ (confirmed + failed)'],
    ['Active extensions', data.activeUsers, `${data.activeTeams} team${data.activeTeams === 1 ? '' : 's'}`],
    ['Connected installs', data.installs.connected, `${data.installs.connectedToday} connected in the last 24h`],
    ['New registrations', data.users.newToday, `${data.users.total} users total`],
    ['Monitored sources', data.sources.companies + data.sources.people, `${data.sources.companies} companies · ${data.sources.people} people`],
    ['Confirmed reposts (7d)', data.week.confirmed, `${data.lifetimeConfirmed} all-time`],
    ['Deliveries awaiting retry', data.delivery.pendingRetries, ''],
    ['User reports sent today', data.userReportsSentToday, 'individual repost emails']
  ];

  const alerts = [];
  if (!today.total) {
    alerts.push('No repost outcome reached the API in the last 24 hours — check that the extension is installed, signed in and running.');
  }
  if (today.failed && rate !== null && rate < 70) {
    alerts.push(`Success rate is ${rate}% — failures are above the normal range.`);
  }
  if (data.delivery.pendingRetries > 0) {
    alerts.push(`${data.delivery.pendingRetries} delivery job${data.delivery.pendingRetries === 1 ? ' is' : 's are'} queued for retry.`);
  }
  if (data.silentInstalls.length) {
    alerts.push(`${data.silentInstalls.length} connected install${data.silentInstalls.length === 1 ? ' has' : 's have'} produced nothing for 7 days: ${data.silentInstalls.map(row => row.who).join(', ')}.`);
  }
  if (!data.sources.companies && !data.sources.people) {
    alerts.push('No company or person source is enabled — the extension has nothing to watch.');
  }

  const metricRowsHtml = metrics.map(([label, value, note]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #e8edf3;color:#4a5b6e">${escapeHtml(label)}</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #e8edf3;font-weight:800;font-size:17px;color:#0f2740;white-space:nowrap">${escapeHtml(value)}</td><td style="padding:10px 12px;border-bottom:1px solid #e8edf3;color:#8194a6;font-size:12px">${escapeHtml(note)}</td></tr>`).join('');

  const alertsHtml = alerts.length
    ? `<div style="margin:0 0 22px;padding:16px 18px;background:#fff6ed;border:1px solid #fed7aa;border-radius:12px"><div style="font-weight:800;color:#9a3412;margin-bottom:8px">Needs attention</div><ul style="margin:0;padding-left:18px;color:#7c2d12;line-height:1.65">${alerts.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
    : '<div style="margin:0 0 22px;padding:16px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;color:#166534;font-weight:700">Nothing needs attention — the extension ran clean in the last 24 hours.</div>';

  const listTable = (title, rows, columns) => {
    if (!rows.length) return '';
    const head = columns.map(column => `<th align="${column.align || 'left'}" style="padding:9px 12px;background:#f4f7fb;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7d">${escapeHtml(column.label)}</th>`).join('');
    const body = rows.map(row => `<tr>${columns.map(column => `<td align="${column.align || 'left'}" style="padding:9px 12px;border-bottom:1px solid #eef2f6;color:#233b52">${column.render(row)}</td>`).join('')}</tr>`).join('');
    return `<h3 style="font-size:15px;margin:26px 0 10px;color:#0f2740">${escapeHtml(title)}</h3><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const failuresHtml = listTable('Why reposts failed', data.failureReasons, [
    { label: 'Reason', render: row => escapeHtml(row.reason) },
    { label: 'Count', align: 'right', render: row => escapeHtml(row.count) }
  ]);

  const sourcesHtml = listTable('Most active sources', data.topSources, [
    { label: 'Source', render: row => escapeHtml(row.source) },
    { label: 'Confirmed', align: 'right', render: row => escapeHtml(row.confirmed) },
    { label: 'Failed', align: 'right', render: row => escapeHtml(row.failed) },
    { label: 'Attempts', align: 'right', render: row => escapeHtml(row.attempts) }
  ]);

  const teamsHtml = listTable('By team', data.teams, [
    { label: 'Team', render: row => escapeHtml(row.team) },
    { label: 'Confirmed', align: 'right', render: row => escapeHtml(row.confirmed) },
    { label: 'Failed', align: 'right', render: row => escapeHtml(row.failed) },
    { label: 'Attempts', align: 'right', render: row => escapeHtml(row.attempts) }
  ]);

  const deliveryHtml = listTable('Delivery engine (24h)', data.delivery.byStatus, [
    { label: 'Job status', render: row => escapeHtml(humanStatus(row.status)) },
    { label: 'Count', align: 'right', render: row => escapeHtml(row.count) }
  ]);

  const recentHtml = listTable('Latest outcomes', data.recent, [
    { label: 'Source', render: row => escapeHtml(row.company_name || 'LinkedIn source') },
    { label: 'User', render: row => escapeHtml(row.user_name || row.user_email || 'unknown') },
    {
      label: 'Outcome',
      render: row => `<span style="font-weight:700;color:${row.status === 'failed' ? '#b42318' : row.status === 'confirmed' ? '#15803d' : '#475467'}">${escapeHtml(humanStatus(row.status))}</span>${row.detail ? `<div style="font-size:12px;color:#8194a6">${escapeHtml(row.detail)}</div>` : ''}`
    },
    {
      label: 'Links',
      render: row => `${row.original_post_url ? `<a href="${escapeHtml(row.original_post_url)}" style="color:#0a66c2">Original</a>` : ''}${row.repost_url ? ` · <a href="${escapeHtml(row.repost_url)}" style="color:#0a66c2">Repost</a>` : ''}`
    }
  ]);

  const textLines = [
    `NexaShare Extension Report — ${dateLabel}`,
    '',
    headline,
    '',
    ...metrics.map(([label, value, note]) => `- ${label}: ${value}${note ? ` (${note})` : ''}`),
    ''
  ];
  if (alerts.length) {
    textLines.push('Needs attention:', ...alerts.map(item => `- ${item}`), '');
  }
  if (data.failureReasons.length) {
    textLines.push('Why reposts failed:', ...data.failureReasons.map(row => `- ${row.reason}: ${row.count}`), '');
  }
  if (data.topSources.length) {
    textLines.push('Most active sources:', ...data.topSources.map(row => `- ${row.source}: ${row.confirmed} confirmed / ${row.failed} failed of ${row.attempts}`), '');
  }
  textLines.push(`Dashboard: ${APP_ORIGIN}/dashboard.html#reposts`);

  return {
    to,
    from: ADMIN_REPORT_FROM,
    subject: `NexaShare Extension Report — ${dateLabel}`,
    text: textLines.join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#eef3f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0f2740"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,39,64,.10)"><tr><td style="background:linear-gradient(135deg,#075985,#0a66c2);padding:28px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Daily extension report</div><div style="font-size:26px;font-weight:800;margin-top:6px">NexaShare — ${escapeHtml(dateLabel)}</div><div style="margin-top:10px;font-size:15px;opacity:.95">${escapeHtml(headline)}</div></td></tr><tr><td style="padding:26px">${alertsHtml}<table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px">${metricRowsHtml}</table>${failuresHtml}${sourcesHtml}${teamsHtml}${deliveryHtml}${recentHtml}<p style="text-align:center;margin:30px 0 6px"><a href="${APP_ORIGIN}/dashboard.html#reposts" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">Open the NexaShare dashboard</a></p><p style="font-size:12px;color:#8194a6;text-align:center;margin:14px 0 0">Covers the 24 hours before ${escapeHtml(data.generatedAt)}. A repost counts as confirmed only after LinkedIn acknowledges it. Sent automatically by the NexaShare Worker.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendWithResend(env, message, recipients) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: message.from,
      to: recipients,
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

async function recordAdminReport(db, row) {
  // Audit + once-per-day guard. Never let a missing table break the send.
  try {
    await db.prepare(
      `INSERT INTO admin_daily_reports (report_date, recipient, status, provider_message_id, error, metrics_json, sent_at)
       VALUES (date('now'), ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(report_date) DO UPDATE SET recipient = excluded.recipient, status = excluded.status,
         provider_message_id = excluded.provider_message_id, error = excluded.error,
         metrics_json = excluded.metrics_json, sent_at = datetime('now')`
    ).bind(row.recipient, row.status, row.providerMessageId || null, row.error || null, row.metricsJson || null).run();
  } catch (error) {
    console.error('Admin report audit write failed', { message: error?.message });
  }
}

async function alreadySentToday(db) {
  try {
    const row = await db.prepare(
      "SELECT 1 AS sent FROM admin_daily_reports WHERE report_date = date('now') AND status = 'sent'"
    ).first();
    return Boolean(row?.sent);
  } catch {
    return false;
  }
}

export async function sendAdminDailyReport(env, options = {}) {
  const recipientSetting = await readReportRecipient(env);
  const recipients = recipientSetting.email ? [recipientSetting.email] : [];

  if (!recipients.length) {
    console.error('Admin daily report skipped: report recipient is invalid or unset.', { error: recipientSetting.error });
    return { sent: 0, skipped: 'report_recipient_not_configured', to: [] };
  }

  if (!env.RESEND_API_KEY) {
    console.log('Admin daily report skipped: RESEND_API_KEY is not configured.');
    return { sent: 0, skipped: 'resend_not_configured', to: recipients };
  }

  if (!options.force && await alreadySentToday(env.DB)) {
    return { sent: 0, skipped: 'already_sent_today', to: recipients };
  }

  const data = await collectAdminReportData(env.DB);
  const message = buildAdminReportEmail(data, { to: recipients[0] });
  const metricsJson = JSON.stringify({
    today: data.today,
    activeUsers: data.activeUsers,
    activeTeams: data.activeTeams,
    installs: data.installs,
    pendingRetries: data.delivery.pendingRetries
  });

  try {
    const providerMessageId = await sendWithResend(env, message, recipients);
    await recordAdminReport(env.DB, { recipient: recipients.join(','), status: 'sent', providerMessageId, metricsJson });
    return { sent: 1, to: recipients, subject: message.subject, providerMessageId, metrics: data.today };
  } catch (error) {
    const reason = String(error?.message || 'Email provider rejected the send').slice(0, 500);
    await recordAdminReport(env.DB, { recipient: recipients.join(','), status: 'failed', error: reason, metricsJson });
    console.error('Admin daily report failed', { message: reason });
    return { sent: 0, failed: 1, to: recipients, error: reason };
  }
}
