// New Chrome extension release notice.
//
// Platform feature (not an external job): whenever a deploy raises
// CURRENT_EXTENSION_VERSION, the Worker cron emails the Gershon reporting inbox once
// for that version, saying a new extension is available and must be installed on
// every client computer. Clients still on an older version are listed.

import { ADMIN_REPORT_TO, reportRecipients } from './admin-report.js';

const APP_ORIGIN = 'https://nexashare.com';
export const RELEASE_NOTICE_FROM = 'GC NexaShare <nexashare@gershon.ai>';

// Plain-language notes per version. Optional: versions without notes still announce.
export const RELEASE_NOTES = {
  '1.2.28': [
    'Company pages: posts are now found from LinkedIn\'s own feed data, so company reposts no longer fail with "post-card layout was not recognized".',
    'The newest post is reposted first; posts older than 30 days are skipped.',
    'Failure messages no longer say the whole batch was stopped.'
  ]
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(part => Number.parseInt(part, 10) || 0);
  const pb = String(b || '0').split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function releaseLinks(version) {
  return {
    download: `https://github.com/gershonconsulting/nexashare/releases/download/extension-v${version}/nexashare-extension-${version}.zip`,
    setup: `${APP_ORIGIN}/extension-setup.html`,
    dashboard: `${APP_ORIGIN}/dashboard.html`
  };
}

export function buildReleaseNoticeEmail(version, clients = [], to = [ADMIN_REPORT_TO]) {
  const links = releaseLinks(version);
  const notes = RELEASE_NOTES[version] || [];
  const outdated = clients.filter(client => compareVersions(client.extension_version, version) < 0);
  const current = clients.length - outdated.length;
  const who = client => client.who || client.email || 'Unknown client';
  const seen = client => client.last_seen_at ? String(client.last_seen_at).slice(0, 16).replace('T', ' ') + ' UTC' : 'never';

  const text = [
    `A new NexaShare Chrome extension is available: version ${version}.`,
    'It needs to be downloaded and installed on ALL client computers running NexaShare.',
    '',
    ...(notes.length ? ['What changed:', ...notes.map(note => `- ${note}`), ''] : []),
    `Download: ${links.download}`,
    `Setup and update instructions: ${links.setup}`,
    '',
    `Clients: ${clients.length} connected, ${current} already on ${version}, ${outdated.length} still need the update.`,
    ...outdated.map(client => `- ${who(client)} (${client.email || 'no email'}) — installed ${client.extension_version || 'unknown'}, last seen ${seen(client)}`),
    '',
    'Sent automatically by the NexaShare Worker when a new extension version is released.'
  ].join('\n');

  const notesHtml = notes.length
    ? `<h3 style="margin:22px 0 8px;font-size:16px">What changed</h3><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.55">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '';
  const rowsHtml = outdated.map(client => `<tr><td style="padding:8px;border-bottom:1px solid #e5edf5">${escapeHtml(who(client))}<div style="color:#64748b;font-size:12px">${escapeHtml(client.email || '')}</div></td><td style="padding:8px;border-bottom:1px solid #e5edf5;color:#b91c1c;font-weight:700">${escapeHtml(client.extension_version || 'unknown')}</td><td style="padding:8px;border-bottom:1px solid #e5edf5;color:#64748b">${escapeHtml(seen(client))}</td></tr>`).join('');
  const clientsHtml = `<h3 style="margin:22px 0 8px;font-size:16px">Clients to update</h3><p style="margin:0 0 10px;font-size:14px">${clients.length} connected · ${current} already on ${escapeHtml(version)} · <strong style="color:${outdated.length ? '#b91c1c' : '#047857'}">${outdated.length} still need the update</strong></p>` +
    (outdated.length ? `<table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px"><tr style="text-align:left;color:#475569;font-size:12px;text-transform:uppercase"><th style="padding:8px">Client</th><th style="padding:8px">Installed</th><th style="padding:8px">Last seen</th></tr>${rowsHtml}</table>` : '');

  return {
    to,
    from: RELEASE_NOTICE_FROM,
    subject: `New Chrome extension available — NexaShare ${version} — update all clients`,
    text,
    html: `<!doctype html><html><body style="margin:0;background:#eef3f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0f2740"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#b91c1c;padding:26px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">New Chrome extension release</div><div style="font-size:26px;font-weight:800;margin-top:6px">NexaShare ${escapeHtml(version)} is available</div><div style="margin-top:10px;font-size:15px">It needs to be downloaded and installed on all client computers.</div></td></tr><tr><td style="padding:26px"><p style="text-align:center;margin:0 0 6px"><a href="${links.download}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">Download NexaShare ${escapeHtml(version)}</a></p><p style="text-align:center;margin:8px 0 0;font-size:13px"><a href="${links.setup}" style="color:#0a66c2">Setup and update instructions</a></p>${notesHtml}${clientsHtml}<p style="font-size:12px;color:#8194a6;text-align:center;margin:26px 0 0">Sent automatically by the NexaShare Worker when a new extension version is released.</p></td></tr></table></td></tr></table></body></html>`
  };
}

async function ensureTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS extension_release_notices (
       version TEXT PRIMARY KEY,
       status TEXT NOT NULL,
       recipients TEXT,
       provider_message_id TEXT,
       error TEXT,
       outdated_clients INTEGER,
       sent_at TEXT
     )`
  ).run();
}

async function loadClients(db) {
  try {
    const result = await db.prepare(
      `SELECT COALESCE(NULLIF(trim(u.name), ''), u.email) AS who, u.email AS email,
              MAX(et.extension_version) AS extension_version, MAX(et.last_seen_at) AS last_seen_at
       FROM extension_tokens et JOIN users u ON u.id = et.user_id
       WHERE et.revoked_at IS NULL
       GROUP BY u.id ORDER BY u.id`
    ).all();
    return result?.results || [];
  } catch (error) {
    console.error('Release notice: client list unavailable', { message: error?.message });
    return [];
  }
}

export async function sendExtensionReleaseNotice(env, version, options = {}) {
  const recipients = reportRecipients(env);
  if (!version) return { sent: 0, skipped: 'no_version' };
  if (!env.RESEND_API_KEY) {
    console.log('Extension release notice skipped: RESEND_API_KEY is not configured.');
    return { sent: 0, skipped: 'resend_not_configured', version };
  }
  await ensureTable(env.DB);
  if (!options.force) {
    const prior = await env.DB.prepare(
      "SELECT status FROM extension_release_notices WHERE version = ?"
    ).bind(version).first();
    if (prior?.status === 'sent') return { sent: 0, skipped: 'already_announced', version };
  }

  const clients = await loadClients(env.DB);
  const message = buildReleaseNoticeEmail(version, clients, recipients);
  const outdated = clients.filter(client => compareVersions(client.extension_version, version) < 0).length;
  let status = 'sent';
  let providerMessageId = null;
  let error = null;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: message.from, to: recipients, subject: message.subject, text: message.text, html: message.html })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.id) throw new Error(String(payload.message || `Resend returned HTTP ${response.status}`).slice(0, 500));
    providerMessageId = payload.id;
  } catch (sendError) {
    status = 'failed';
    error = String(sendError?.message || sendError).slice(0, 500);
  }

  await env.DB.prepare(
    `INSERT INTO extension_release_notices (version, status, recipients, provider_message_id, error, outdated_clients, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(version) DO UPDATE SET status = excluded.status, recipients = excluded.recipients,
       provider_message_id = excluded.provider_message_id, error = excluded.error,
       outdated_clients = excluded.outdated_clients, sent_at = excluded.sent_at`
  ).bind(version, status, recipients.join(','), providerMessageId, error, outdated).run();

  if (status !== 'sent') console.error('Extension release notice failed', { version, error });
  return { sent: status === 'sent' ? 1 : 0, status, version, providerMessageId, error, outdated, to: recipients };
}
