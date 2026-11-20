import assert from 'node:assert/strict';
import { evaluateClientReport, operatorCause, buildHeldReportsAlert, HELD_REPORT_STATUS } from '../src/client-report-gate.js';
import { summarize, sendDailyUserReports } from '../src/worker.js';

let passed = 0;
const check = (name, fn) => { fn(); passed++; };

// Exact failure details the extension wrote into client reports on 2026-11-17/18.
const SOURCE_UNAVAILABLE = 'LinkedIn reports this source page as unavailable (it redirects to linkedin.com/company/unavailable/). The page may have been removed or renamed; update or remove this source in NexaShare.';
const LAYOUT = 'LinkedIn loaded, but its post-card layout was not recognized. NexaShare skipped this source, continued with the others, and scheduled a controlled retry.';
const REPOST_CHOICE = "NexaShare opened the repost menu but could not identify LinkedIn's visible Repost instantly choice.";
const LOGIN = 'LinkedIn signed the browser out while NexaShare was running. Sign in again; the remaining sources were preserved.';

const row = (status, detail = null, company = 'Phitechbio') => ({ status, detail, company_name: company, original_post_url: 'https://www.linkedin.com/company/phitechbio/posts/' });
const evaluate = (rows, signals = { ranYesterday: true }) => evaluateClientReport(rows, summarize(rows), signals);

// ---------------------------------------------------------------- classifier
check('source_unavailable', () => assert.equal(operatorCause(SOURCE_UNAVAILABLE).code, 'source_unavailable'));
check('login', () => assert.equal(operatorCause(LOGIN).code, 'linkedin_login_required'));
check('layout', () => assert.equal(operatorCause(LAYOUT).code, 'linkedin_layout_unrecognized'));
check('repost choice', () => assert.equal(operatorCause(REPOST_CHOICE).code, 'repost_control_unavailable'));
check('rate limited', () => assert.equal(operatorCause('LinkedIn temporarily limited page loading. NexaShare stopped the batch and scheduled a controlled retry.').code, 'linkedin_transient'));
check('unknown detail', () => assert.equal(operatorCause('Something nobody has seen before'), null));
check('empty detail', () => assert.equal(operatorCause(''), null));

// ---------------------------------------------------------------- gate decisions
// Tunahan 2026-11-18: 0 confirmed, 3 failed (2 source unavailable + 1 layout) -> hold.
check('tunahan 11-18 held', () => {
  const g = evaluate([row('failed', SOURCE_UNAVAILABLE), row('failed', SOURCE_UNAVAILABLE), row('failed', LAYOUT)]);
  assert.equal(g.hold, true);
  const su = g.causes.find(c => c.code === 'source_unavailable');
  assert.equal(su.count, 2);
  assert.deepEqual(su.sources, ['Phitechbio']);
  assert.match(su.fix, /Replace or remove this source/);
});
// Markus 2026-11-17: 0 confirmed, 2 failed, repost choice not identified -> hold.
check('markus 11-17 held', () => {
  const g = evaluate([row('failed', REPOST_CHOICE, 'Amphasys'), row('failed', REPOST_CHOICE, 'Amphasys')]);
  assert.equal(g.hold, true);
  assert.equal(g.causes[0].code, 'repost_control_unavailable');
});
// Olivier 2026-11-16/17: no run recorded -> hold (no ACTION NEEDED mail to the client).
check('no run held', () => {
  const g = evaluateClientReport([], summarize([]), { ranYesterday: false });
  assert.equal(g.hold, true);
  assert.equal(g.causes[0].code, 'no_run_recorded');
});
check('login required held', () => assert.equal(evaluate([row('failed', LOGIN)]).hold, true));
// Markus 2026-11-18: 2 confirmed, 1 failed -> normal report (66.7%).
check('any confirmed -> send', () => assert.equal(evaluate([row('confirmed'), row('confirmed'), row('failed', REPOST_CHOICE)]).hold, false));
check('quiet day -> send', () => assert.equal(evaluate([], { ranYesterday: true }).hold, false));
check('only skips -> send', () => assert.equal(evaluate([row('skipped'), row('already_reposted')]).hold, false));
check('one unknown failure -> send', () => assert.equal(evaluate([row('failed', SOURCE_UNAVAILABLE), row('failed', 'Mystery error')]).hold, false));
check('failed without detail -> send', () => assert.equal(evaluate([row('failed', null)]).hold, false));
check('totals say failed but no rows -> send', () => assert.equal(evaluateClientReport([], { processed: 3, confirmed: 0, failed: 3 }, { ranYesterday: true }).hold, false));

// ---------------------------------------------------------------- internal alert
check('alert content', () => {
  const held = [
    { user: { id: 9, name: 'Tunahan Cakir', email: 'tunahan@example.com' }, today: { confirmed: 0, failed: 3 },
      causes: evaluate([row('failed', SOURCE_UNAVAILABLE), row('failed', LAYOUT)]).causes },
    { user: { id: 1, name: 'Olivier <b>', email: 'o@example.com' }, today: { confirmed: 0, failed: 0 },
      causes: evaluateClientReport([], summarize([]), { ranYesterday: false }).causes }
  ];
  const a = buildHeldReportsAlert(held, { reportDate: '2026-11-18', from: 'GC NexaShare <nexashare@gershon.ai>', to: ['report@gershonconsulting.com'] });
  assert.equal(a.subject, '[NexaShare] 2 client reports held · 2026-11-18 ET · operator-side failures to fix');
  assert.deepEqual(a.to, ['report@gershonconsulting.com']);
  assert.match(a.text, /Tunahan Cakir <tunahan@example\.com> \(user 9\)/);
  assert.match(a.text, /Source page unavailable.*\[Phitechbio\]/);
  assert.match(a.text, /Fix: Replace or remove this source/);
  assert.match(a.text, /No run recorded/);
  assert.match(a.html, /Internal · not sent to clients/);
  assert.match(a.html, /Olivier &lt;b&gt;/, 'names are escaped');
  assert.doesNotMatch(a.text, /0% success/);
});

// ---------------------------------------------------------------- send path (integration)
{
  // Users: 9 = Tunahan (operator-side 0%), 10 = Markus (normal day), 1 = Olivier (no run).
  const users = [
    { id: 9, email: 'tunahan@example.com', name: 'Tunahan Cakir' },
    { id: 10, email: 'markus@example.com', name: 'Markus Bernasconi' },
    { id: 1, email: 'olivier@example.com', name: 'Olivier Attia' }
  ];
  const outcomes = {
    9: [row('failed', SOURCE_UNAVAILABLE), row('failed', SOURCE_UNAVAILABLE), row('failed', LAYOUT)],
    10: [row('confirmed', null, 'Amphasys'), row('confirmed', null, 'Amphasys'), row('failed', REPOST_CHOICE, 'Amphasys')],
    1: []
  };
  const counts = rows => {
    const s = summarize(rows);
    return { total: s.processed, confirmed: s.confirmed, failed: s.failed, skipped: 0, already_reposted: 0 };
  };
  const inserts = [];
  const db = {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async all() {
          if (/FROM users u/.test(sql)) return { results: users };
          if (/FROM reposts/.test(sql)) return { results: outcomes[args[0]] || [] };
          return { results: [] };
        },
        async first() {
          if (/FROM extension_runs/.test(sql)) return { runs: args[0] === 1 ? 0 : 2 };
          if (/FROM extension_tokens/.test(sql)) return { extension_version: '1.2.34', last_seen_at: null };
          if (/FROM reposts/.test(sql)) return counts(outcomes[args[0]] || []);
          return null;
        },
        async run() { if (/INSERT INTO daily_reports/.test(sql)) inserts.push({ sql, args }); return {}; }
      };
      return stmt;
    }
  };
  const sentMail = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sentMail.push({ ...body, idempotency: init.headers['Idempotency-Key'] });
    return new Response(JSON.stringify({ id: `msg-${sentMail.length}` }), { status: 200 });
  };
  try {
    const result = await sendDailyUserReports({ DB: db, RESEND_API_KEY: 'test-key' });
    assert.equal(result.sent, 1);
    assert.equal(result.held, 2);
    assert.equal(result.heldAlert, 'msg-2');
    const recipients = sentMail.map(m => m.to.join(','));
    assert.deepEqual(recipients, ['markus@example.com', 'report@gershonconsulting.com'], 'held clients get nothing; Gershon gets one alert');
    assert.doesNotMatch(sentMail.map(m => m.subject).join('\n'), /0% success|ACTION NEEDED/);
    const alert = sentMail[1];
    assert.equal(alert.from, 'GC NexaShare <nexashare@gershon.ai>');
    assert.match(alert.text, /Tunahan Cakir/);
    assert.match(alert.text, /Olivier Attia/);
    assert.match(alert.idempotency, /^nexashare-held-\d{4}-\d{2}-\d{2}$/);
    // Held clients are recorded so the same day is never re-sent, with a distinct status.
    const heldRows = inserts.filter(i => i.args.includes(HELD_REPORT_STATUS)).map(i => i.args[0]);
    assert.deepEqual(heldRows.sort(), [1, 9]);
    passed++;

    // ADMIN_REPORT_TO override is honoured for the alert.
    sentMail.length = 0;
    await sendDailyUserReports({ DB: db, RESEND_API_KEY: 'test-key', ADMIN_REPORT_TO: 'ops@example.com, olivier@example.org' });
    assert.deepEqual(sentMail.at(-1).to, ['ops@example.com', 'olivier@example.org']);
    passed++;

    // Nothing held -> no internal alert.
    users.splice(0, users.length, { id: 10, email: 'markus@example.com', name: 'Markus Bernasconi' });
    sentMail.length = 0;
    const quiet = await sendDailyUserReports({ DB: db, RESEND_API_KEY: 'test-key' });
    assert.equal(quiet.held, 0);
    assert.equal(sentMail.length, 1);
    passed++;
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log(`client report gate checks passed (${passed}/${passed})`);
