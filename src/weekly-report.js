const APP_ORIGIN = 'https://nexashare.com';
const REPORT_FROM = 'NexaShare <nexashare@gershon.ai>';
const ADMIN_REPORT_TO = 'report@gershonconsulting.com';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

export function isSunday(date = new Date()) {
  return date.getUTCDay() === 0;
}

export function weekKey(date = new Date()) {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
}

export function weeklyHealth(data, currentVersion) {
  if (!data.extensionVersion) {
    return { code: 'red', icon: '❌', label: 'Red — extension not connected', colour: '#b42318' };
  }
  if (!data.runDays) {
    return { code: 'red', icon: '❌', label: 'Red — extension did not run', colour: '#b42318' };
  }
  if (!data.confirmed && data.failed) {
    return { code: 'red', icon: '❌', label: 'Red — repost attempts failed', colour: '#b42318' };
  }
  if (data.extensionVersion !== currentVersion || data.runDays < 7 || data.failed || !data.confirmed) {
    return { code: 'orange', icon: '⚠️', label: 'Orange — attention needed', colour: '#b54708' };
  }
  return { code: 'green', icon: '✅', label: 'Green — everything worked', colour: '#067647' };
}

function healthReason(data, currentVersion) {
  const reasons = [];
  if (!data.extensionVersion) reasons.push('No Chrome extension version has reported to NexaShare.');
  else if (data.extensionVersion !== currentVersion) reasons.push(`Chrome extension v${data.extensionVersion} is installed; current is v${currentVersion}.`);
  if (!data.runDays) reasons.push('The extension did not run during the week.');
  else if (data.runDays < 7) reasons.push(`The extension reported on ${data.runDays} of 7 days.`);
  if (data.failed) reasons.push(`${data.failed} repost attempt${data.failed === 1 ? '' : 's'} failed.`);
  if (!data.confirmed && data.runDays) reasons.push('No repost was confirmed by LinkedIn.');
  if (!reasons.length) reasons.push(`${data.confirmed} repost${data.confirmed === 1 ? '' : 's'} confirmed with no failures.`);
  return reasons.join(' ');
}

function rangeLabel(date = new Date()) {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const format = value => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(value);
  return `${format(start)} – ${format(end)}`;
}

export function buildWeeklyUserEmail(user, data, currentVersion, date = new Date()) {
  const health = weeklyHealth(data, currentVersion);
  const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const reason = healthReason(data, currentVersion);
  const rows = data.outcomes?.length
    ? data.outcomes.slice(0, 100).map(row => `<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.company_name || 'LinkedIn source')}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb">${escapeHtml(String(row.status || '').replaceAll('_', ' '))}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb">${row.repost_url ? `<a href="${escapeHtml(row.repost_url)}">View repost</a>` : escapeHtml(row.detail || '—')}</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding:14px;color:#667085">No repost outcomes were recorded this week.</td></tr>';
  const textDetails = data.outcomes?.length
    ? data.outcomes.slice(0, 100).map(row => `- ${row.company_name || 'LinkedIn source'}: ${String(row.status || '').replaceAll('_', ' ')}${row.detail ? ` — ${row.detail}` : ''}${row.repost_url ? ` — ${row.repost_url}` : ''}`).join('\n')
    : '- No repost outcomes were recorded this week.';

  return {
    from: REPORT_FROM,
    to: user.email,
    subject: `${health.icon} NexaShare weekly report — ${data.confirmed} reposts confirmed`,
    text: `Hi ${firstName},\n\n${health.label}\n${reason}\n\nWeek: ${rangeLabel(date)}\n- Confirmed reposts: ${data.confirmed}\n- Failed attempts: ${data.failed}\n- Skipped / already reposted: ${data.skipped}\n- Extension run days: ${data.runDays}/7\n- Chrome extension: ${data.extensionVersion ? `v${data.extensionVersion}` : 'not detected'} (current v${currentVersion})\n\nActivity\n${textDetails}\n\nDashboard: ${APP_ORIGIN}/dashboard.html#reposts`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%"><tr><td align="center" style="padding:30px 14px"><table width="100%" style="max-width:720px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:${health.colour};color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">${health.icon} NexaShare weekly report</div><div style="margin-top:6px">${escapeHtml(rangeLabel(date))}</div></td></tr><tr><td style="padding:26px"><p>Hi ${escapeHtml(firstName)},</p><div style="padding:15px;border-left:5px solid ${health.colour};background:#f8fafc"><strong style="color:${health.colour}">${escapeHtml(health.label)}</strong><div style="margin-top:5px">${escapeHtml(reason)}</div></div><ul><li><b>${data.confirmed}</b> confirmed reposts</li><li><b>${data.failed}</b> failed attempts</li><li><b>${data.skipped}</b> skipped / already reposted</li><li>Extension ran on <b>${data.runDays}/7</b> days</li><li>Chrome extension: <b>${escapeHtml(data.extensionVersion ? `v${data.extensionVersion}` : 'not detected')}</b> (current v${escapeHtml(currentVersion)})</li></ul><h3>Activity this week</h3><table width="100%" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" style="padding:9px;background:#f8fafc">Source</th><th align="left" style="padding:9px;background:#f8fafc">Outcome</th><th align="left" style="padding:9px;background:#f8fafc">Details</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:center;margin-top:24px"><a href="${APP_ORIGIN}/dashboard.html#reposts" style="background:#0a66c2;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open dashboard</a></p></td></tr></table></td></tr></table></body></html>`
  };
}

export function buildWeeklyAdminEmail(users, currentVersion, date = new Date(), to = ADMIN_REPORT_TO) {
  const healthCounts = { green: 0, orange: 0, red: 0 };
  const enriched = users.map(user => {
    const health = weeklyHealth(user, currentVersion);
    healthCounts[health.code]++;
    return { ...user, health, reason: healthReason(user, currentVersion) };
  });
  const totals = enriched.reduce((sum, user) => ({
    confirmed: sum.confirmed + user.confirmed,
    failed: sum.failed + user.failed,
    skipped: sum.skipped + user.skipped
  }), { confirmed: 0, failed: 0, skipped: 0 });
  const rows = enriched.map(user => `<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb"><b>${user.health.icon} ${escapeHtml(user.name || user.email)}</b><div style="font-size:12px;color:#667085">${escapeHtml(user.email)}</div></td><td style="padding:9px;border-bottom:1px solid #e5e7eb">${escapeHtml(user.extensionVersion ? `v${user.extensionVersion}` : 'Not detected')}<div style="font-size:12px;color:#667085">Last seen: ${escapeHtml(user.lastSeenAt || 'never')}</div></td><td style="padding:9px;border-bottom:1px solid #e5e7eb">${user.confirmed} confirmed<br>${user.failed} failed<br>${user.skipped} skipped<br>${user.runDays}/7 run days</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;color:${user.health.colour}"><b>${escapeHtml(user.health.label)}</b><div style="font-size:12px;color:#667085">${escapeHtml(user.reason)}</div></td></tr>`).join('');
  const textUsers = enriched.map(user => `${user.health.icon} ${user.name || user.email} <${user.email}> — extension ${user.extensionVersion ? `v${user.extensionVersion}` : 'not detected'}; ${user.confirmed} confirmed, ${user.failed} failed, ${user.skipped} skipped, ${user.runDays}/7 run days. ${user.reason}`).join('\n');

  return {
    from: REPORT_FROM,
    to,
    subject: `NexaShare weekly administrator report — ${healthCounts.green} green, ${healthCounts.orange} orange, ${healthCounts.red} red`,
    text: `NexaShare weekly administrator report\nWeek: ${rangeLabel(date)}\n\nUsers: ${enriched.length}\nStatus: ${healthCounts.green} green, ${healthCounts.orange} orange, ${healthCounts.red} red\nConfirmed: ${totals.confirmed}\nFailed: ${totals.failed}\nSkipped: ${totals.skipped}\nCurrent extension: v${currentVersion}\n\nEvery user\n${textUsers}\n\nDashboard: ${APP_ORIGIN}/dashboard.html#reposts`,
    html: `<!doctype html><html><body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#172033"><table width="100%"><tr><td align="center" style="padding:30px 14px"><table width="100%" style="max-width:900px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#0a66c2;color:#fff;padding:26px"><div style="font-size:25px;font-weight:800">NexaShare weekly administrator report</div><div style="margin-top:6px">${escapeHtml(rangeLabel(date))}</div></td></tr><tr><td style="padding:26px"><p><b>${enriched.length}</b> users · <span style="color:#067647"><b>✅ ${healthCounts.green} green</b></span> · <span style="color:#b54708"><b>⚠️ ${healthCounts.orange} orange</b></span> · <span style="color:#b42318"><b>❌ ${healthCounts.red} red</b></span></p><p><b>${totals.confirmed}</b> confirmed · <b>${totals.failed}</b> failed · <b>${totals.skipped}</b> skipped · current extension <b>v${escapeHtml(currentVersion)}</b></p><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left" style="padding:9px;background:#f8fafc">User</th><th align="left" style="padding:9px;background:#f8fafc">Extension</th><th align="left" style="padding:9px;background:#f8fafc">Week</th><th align="left" style="padding:9px;background:#f8fafc">Health</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:12px;color:#667085;margin-top:18px">Green: extension ran all 7 days, at least one repost was confirmed, no failures, and the current version is installed. Orange: partial activity or attention needed. Red: extension missing/not running, or all repost attempts failed.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function sendWithResend(env, message, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, text: message.text, html: message.html })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) throw new Error(String(payload.message || `Resend returned HTTP ${response.status}`).slice(0, 500));
  return payload.id;
}

async function collectUserWeek(db, user) {
  const outcomes = (await db.prepare(`SELECT company_name, status, detail, repost_url FROM reposts WHERE user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-7 day') ORDER BY datetime(COALESCE(attempted_at, created_at)) DESC LIMIT 100`).bind(user.id).all()).results || [];
  const totals = await db.prepare(`SELECT SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status IN ('skipped', 'already_reposted') THEN 1 ELSE 0 END) AS skipped FROM reposts WHERE user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime('now', '-7 day')`).bind(user.id).first().catch(() => null);
  const counts = { confirmed: Number(totals?.confirmed || 0), failed: Number(totals?.failed || 0), skipped: Number(totals?.skipped || 0) };
  const run = await db.prepare(`SELECT COUNT(DISTINCT date(created_at)) AS days FROM extension_runs WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-7 day')`).bind(user.id).first().catch(() => null);
  const token = await db.prepare(`SELECT extension_version, last_seen_at FROM extension_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1`).bind(user.id).first().catch(() => null);
  return { ...counts, outcomes, runDays: Number(run?.days || 0), extensionVersion: token?.extension_version || null, lastSeenAt: token?.last_seen_at || null };
}

export async function sendSundayReports(env, currentVersion, options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  if (!options.force && !isSunday(date)) return { sent: 0, skipped: 'not_sunday' };
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: 'resend_not_configured' };
  const users = (await env.DB.prepare(`SELECT id, email, name, team_id FROM users WHERE email IS NOT NULL AND trim(email) <> '' ORDER BY id LIMIT 1000`).all()).results || [];
  const key = weekKey(date);
  let userReportsSent = 0;
  let failed = 0;
  const adminRows = [];
  for (const user of users) {
    const data = await collectUserWeek(env.DB, user);
    adminRows.push({ ...user, ...data });
    try {
      await sendWithResend(env, buildWeeklyUserEmail(user, data, currentVersion, date), `nexashare-weekly-user-${user.id}-${key}`);
      userReportsSent++;
    } catch (error) {
      failed++;
      console.error('Weekly user report failed', { userId: user.id, message: error?.message });
    }
  }
  const adminTo = String(env.ADMIN_REPORT_TO || ADMIN_REPORT_TO).split(',')[0].trim() || ADMIN_REPORT_TO;
  let adminReportSent = 0;
  try {
    await sendWithResend(env, buildWeeklyAdminEmail(adminRows, currentVersion, date, adminTo), `nexashare-weekly-admin-${key}`);
    adminReportSent = 1;
  } catch (error) {
    failed++;
    console.error('Weekly administrator report failed', { message: error?.message });
  }
  return { userReportsSent, adminReportSent, failed, eligibleUsers: users.length };
}
