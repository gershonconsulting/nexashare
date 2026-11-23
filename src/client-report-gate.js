// Client daily-report sanity gate.
//
// NexaShare is a managed service: Gershon operates the extension, the LinkedIn
// session and the source list for each client. When a client's reporting day has
// zero confirmed reposts and every cause is on Gershon's side (no run recorded,
// LinkedIn sign-in required, source page unavailable, extension could not drive
// LinkedIn's layout), a "0% success" / "ACTION NEEDED" e-mail only alarms the
// client about something they cannot fix. In that case the client gets no e-mail
// that day; Gershon gets one internal alert listing each held client, the reason
// and the fix. The client's next normal day sends the normal report.
//
// Anything the gate cannot attribute to the operator (an unrecognised failure
// detail) leaves the client report untouched.

export const HELD_REPORT_STATUS = 'held_operator';

// Ordered: first match wins. `fix` is what Gershon must do, not the client.
const OPERATOR_CAUSES = [
  {
    code: 'source_unavailable',
    test: /company\/unavailable|source page as unavailable/i,
    label: 'Source page unavailable on LinkedIn (removed or renamed)',
    fix: 'Replace or remove this source in the client\'s NexaShare source list.'
  },
  {
    code: 'linkedin_login_required',
    test: /signed the browser out|sign in again|not signed in|login required|linkedin_login_required/i,
    label: 'LinkedIn sign-in required on the automation browser',
    fix: 'Sign the automation browser back in to LinkedIn for this client, then run a controlled test.'
  },
  {
    code: 'linkedin_checkpoint',
    test: /security checkpoint/i,
    label: 'LinkedIn security checkpoint',
    fix: 'Complete the LinkedIn checkpoint on the automation browser, then run a controlled test.'
  },
  {
    code: 'linkedin_layout_unrecognized',
    test: /post-card layout was not recognized|did not expose any posts|redirected the company feed/i,
    label: 'Extension could not read the LinkedIn source page',
    fix: 'Check the source page in the automation browser and the extension discovery diagnostics; patch the extension if LinkedIn changed its layout.'
  },
  {
    code: 'repost_control_unavailable',
    test: /could not identify LinkedIn.s visible|repost button was not found|repost control|direct repost action/i,
    label: 'Extension could not find LinkedIn\'s repost control',
    fix: 'Check the extension version and repost diagnostics for this client; patch the repost selector if LinkedIn changed it.'
  },
  {
    code: 'linkedin_transient',
    test: /temporarily limited|did not return an outcome|tab closed|did not finish loading|timeout|http 429|http 5\d\d/i,
    label: 'LinkedIn did not respond during the run (rate limit, timeout or closed tab)',
    fix: 'Check the automation browser and run a controlled test; reduce the batch size if LinkedIn keeps rate-limiting.'
  }
];

export const NO_RUN_CAUSE = Object.freeze({
  code: 'no_run_recorded',
  label: 'No run recorded: the extension did not run on the reporting day',
  fix: 'Check that Chrome is running on the client\'s automation machine with the extension installed and signed in to LinkedIn, then use Run test now.'
});

// Map one failed repost row's detail to an operator-side cause, or null.
export function operatorCause(detail) {
  const text = String(detail || '').slice(0, 2000);
  if (!text.trim()) return null;
  const cause = OPERATOR_CAUSES.find(entry => entry.test.test(text));
  return cause ? { code: cause.code, label: cause.label, fix: cause.fix } : null;
}

// Decide whether a client's daily report should be held.
//   rows    - the reporting day's repost rows (status, detail, company_name)
//   today   - summarize()/collectDaySummary() result for the reporting day
//   signals - { ranYesterday }
// Returns { hold: false } or { hold: true, causes: [{ code, label, fix, count, sources }] }.
export function evaluateClientReport(rows, today, signals = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const confirmed = Number(today?.confirmed || 0);
  const failed = Number(today?.failed || 0);
  const processed = Number(today?.processed || 0);
  const ran = Boolean(signals.ranYesterday) || processed > 0;

  if (confirmed > 0) return { hold: false };

  if (!ran) {
    return { hold: true, causes: [{ ...NO_RUN_CAUSE, count: 0, sources: [] }] };
  }

  // Ran, nothing failed: a quiet day, not a 0% day.
  if (!failed) return { hold: false };

  const failedRows = list.filter(row => row?.status === 'failed');
  // Totals say there were failures but no detail rows are available: cannot attribute.
  if (!failedRows.length) return { hold: false };

  const byCode = new Map();
  for (const row of failedRows) {
    const cause = operatorCause(row.detail);
    if (!cause) return { hold: false }; // at least one failure is not operator-side
    const entry = byCode.get(cause.code) || { ...cause, count: 0, sources: [] };
    entry.count++;
    const source = String(row.company_name || '').trim();
    if (source && !entry.sources.includes(source)) entry.sources.push(source);
    byCode.set(cause.code, entry);
  }
  return { hold: true, causes: [...byCode.values()] };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

// One internal e-mail for all clients held on the reporting day.
//   held: [{ user: { id, name, email }, causes, today }]
export function buildHeldReportsAlert(held, { reportDate, from, to }) {
  const n = held.length;
  const subject = `[NexaShare] ${n} client report${n === 1 ? '' : 's'} held · ${reportDate} ET · operator-side failures to fix`;
  const textBlocks = held.map(({ user, causes, today }) => {
    const who = `${user.name || 'Unnamed'} <${user.email}> (user ${user.id})`;
    const counts = `confirmed ${Number(today?.confirmed || 0)}, failed ${Number(today?.failed || 0)}`;
    const lines = causes.map(cause => {
      const where = cause.sources?.length ? ` [${cause.sources.join(', ')}]` : '';
      const times = cause.count ? ` ×${cause.count}` : '';
      return `  - ${cause.label}${times}${where}\n    Fix: ${cause.fix}`;
    }).join('\n');
    return `${who} — ${counts}\n${lines}`;
  });
  const text = [
    `NexaShare held ${n} client daily report${n === 1 ? '' : 's'} for ${reportDate} (ET).`,
    'Each of these clients had 0 confirmed reposts and every cause is on Gershon\'s side, so the client was NOT e-mailed a 0% report. Fix the cause below; the client receives the normal report on the next day it runs.',
    '',
    ...textBlocks.flatMap(block => [block, '']),
    'Sent automatically by the NexaShare Worker (client report gate).'
  ].join('\n');

  const rowsHtml = held.map(({ user, causes, today }) => {
    const causeHtml = causes.map(cause => `<li style="margin:0 0 8px"><b>${escapeHtml(cause.label)}</b>${cause.count ? ` &times;${cause.count}` : ''}${cause.sources?.length ? ` <span style="color:#667085">[${escapeHtml(cause.sources.join(', '))}]</span>` : ''}<br><span style="color:#1f6f5c">Fix: ${escapeHtml(cause.fix)}</span></li>`).join('');
    return `<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top"><b>${escapeHtml(user.name || 'Unnamed')}</b><br><span style="font-size:12px;color:#667085">${escapeHtml(user.email)} · user ${escapeHtml(user.id)}</span><br><span style="font-size:12px;color:#667085">confirmed ${Number(today?.confirmed || 0)}, failed ${Number(today?.failed || 0)}</span></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top"><ul style="margin:0;padding-left:18px">${causeHtml}</ul></td></tr>`;
  }).join('');

  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>NexaShare held client reports</title></head><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#12211d"><table role="presentation" width="100%"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" style="max-width:720px;border:1px solid #dfe5e2;border-radius:12px"><tr><td style="padding:24px 26px;border-bottom:2px solid #b54708"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase">Internal · not sent to clients</div><div style="font-size:22px;font-weight:800;margin-top:6px">${n} client report${n === 1 ? '' : 's'} held · ${escapeHtml(reportDate)} ET</div><div style="margin-top:8px;font-size:14px">These clients had 0 confirmed reposts and every cause is on Gershon's side, so no 0% report was sent to them. Fix the cause; the next normal report goes out automatically.</div></td></tr><tr><td style="padding:18px 26px"><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left" style="padding:10px;background:#f8fafc">Client</th><th align="left" style="padding:10px;background:#f8fafc">Reason and fix</th></tr></thead><tbody>${rowsHtml}</tbody></table><p style="font-size:12px;color:#8194a6">Sent automatically by the NexaShare Worker (client report gate).</p></td></tr></table></td></tr></table></body></html>`;

  return { from, to, subject, text, html };
}
