import assert from 'node:assert/strict';
import {
  ADMIN_REPORT_TO,
  buildAdminReportEmail,
  collectAdminReportData,
  formatReportDate,
  reportRecipients,
  sendAdminDailyReport
} from '../src/admin-report.js';
import { DatabaseSync } from 'node:sqlite';
import { collectDaySummary, reportDayWindow, dateBasisFooter } from '../src/reporting.js';
import { buildDailyReport } from '../src/worker.js';

// Minimal D1 stand-in: each entry matches on a fragment of the SQL.
function fakeDb(fixtures, { throwOn = [], onRun } = {}) {
  return {
    prepare(sql) {
      const normalised = sql.replace(/\s+/g, ' ');
      if (throwOn.some(fragment => normalised.includes(fragment))) {
        throw new Error('no such table');
      }
      const match = fixtures.find(entry => normalised.includes(entry.match));
      const rows = match ? match.rows : [];
      const statement = {
        bind: () => statement,
        all: async () => ({ results: rows }),
        first: async () => rows[0] ?? null,
        run: async () => {
          onRun?.(normalised);
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
}

const fixtures = [
  {
    match: "GROUP BY status",
    rows: [
      { status: 'confirmed', count: 12 },
      { status: 'failed', count: 3 },
      { status: 'skipped', count: 2 },
      { status: 'already_reposted', count: 1 }
    ]
  },
  { match: 'active_users', rows: [{ active_users: 4, active_teams: 2 }] },
  {
    match: 'No reason reported by the extension',
    rows: [
      { reason: 'Repost button not found', count: 2 },
      { reason: 'LinkedIn rate limited the session', count: 1 }
    ]
  },
  {
    match: 'Unnamed source',
    rows: [{ source: 'Gershon Consulting', confirmed: 7, failed: 1, attempts: 9 }]
  },
  { match: "'Team ' ||", rows: [{ team: 'Gershon', confirmed: 12, failed: 3, attempts: 18 }] },
  {
    match: 'ORDER BY datetime(COALESCE(r.attempted_at, r.created_at)) DESC',
    rows: [{
      company_name: 'Gershon Consulting',
      original_post_url: 'https://www.linkedin.com/feed/update/1',
      repost_url: 'https://www.linkedin.com/feed/update/2',
      status: 'failed',
      detail: 'Repost button not found',
      user_name: 'Olivier Attia',
      user_email: 'olivier@gershonconsulting.com'
    }]
  },
  { match: 'new_today', rows: [{ total: 9, new_today: 1, new_this_week: 3 }] },
  { match: 'connected_today', rows: [{ connected: 5, connected_today: 1 }] },
  { match: 'GROUP BY u.id', rows: [{ who: 'Dormant Tester', email: 'dormant@example.com' }] },
  { match: 'FROM companies WHERE enabled', rows: [{ companies: 6, people: 2 }] },
  { match: 'FROM delivery_jobs WHERE datetime(updated_at)', rows: [{ status: 'published', count: 12 }, { status: 'failed', count: 3 }] },
  { match: 'unclassified', rows: [{ code: 'selector_missing', count: 2 }] },
  { match: 'AS pending FROM delivery_jobs', rows: [{ pending: 2 }] },
  { match: 'AS confirmed FROM reposts', rows: [{ confirmed: 431 }] },
  { match: 'FROM daily_reports WHERE report_date', rows: [{ sent: 3 }] }
];

// --- collection -------------------------------------------------------------
const data = await collectAdminReportData(fakeDb(fixtures));
assert.equal(data.today.confirmed, 12);
assert.equal(data.today.failed, 3);
assert.equal(data.today.total, 18);
assert.equal(data.activeUsers, 4);
assert.equal(data.installs.connected, 5);
assert.equal(data.users.newToday, 1);
assert.equal(data.sources.companies + data.sources.people, 8);
assert.equal(data.delivery.pendingRetries, 2);
assert.equal(data.lifetimeConfirmed, 431);

// A missing table must degrade, never throw.
const degraded = await collectAdminReportData(fakeDb(fixtures, { throwOn: ['FROM delivery_jobs', 'FROM people'] }));
assert.equal(degraded.today.confirmed, 12);
assert.deepEqual(degraded.delivery.byStatus, []);
assert.equal(degraded.delivery.pendingRetries, 0);

// --- rendering --------------------------------------------------------------
const email = buildAdminReportEmail(data, { date: new Date('2026-09-03T06:00:00Z') });
// Sent 06:00 UTC on Sept 3 = the ET day Sept 2, the same basis as the per-user reports.
assert.equal(email.subject, 'NexaShare Extension Report — September 2, 2026 ET · 80% success · 12 confirmed, 3 failed');
assert.match(email.text, /Counts for 2026-09-02 ET · source NexaShare reposts table/);
assert.match(email.html, /Counts for 2026-09-02 ET · source NexaShare reposts table/);
assert.equal(email.to, ADMIN_REPORT_TO);
assert.equal(email.from, 'GC NexaShare <nexashare@gershon.ai>');
assert.match(email.html, /12 confirmed, 3 failed, 3 skipped across 4 active extensions/);
assert.match(email.html, /Repost button not found/);
assert.match(email.html, /Needs attention/);
assert.match(email.html, /2 delivery jobs are queued for retry/);
assert.match(email.html, /Dormant Tester/);
assert.match(email.text, /NexaShare Extension Report — September 2, 2026 ET/);
assert.match(email.text, /- Confirmed reposts: 12/);
assert.match(email.text, /- Success rate: 80%/);
assert.ok(!email.html.includes('undefined'), 'rendered report must not leak undefined');

// Quiet day: the report still goes out and says so loudly.
const quiet = await collectAdminReportData(fakeDb([]));
const quietEmail = buildAdminReportEmail(quiet, { date: new Date('2026-09-03T06:00:00Z') });
assert.match(quietEmail.html, /No extension activity was recorded on the reporting day \(ET\)/);
assert.match(quietEmail.html, /check that the extension is installed/);
assert.match(quietEmail.text, /- Success rate: n\/a/);

// HTML injection from a scraped company name must not escape into markup.
const hostile = await collectAdminReportData(fakeDb([
  { match: 'Unnamed source', rows: [{ source: '<script>alert(1)</script>', confirmed: 0, failed: 1, attempts: 1 }] }
]));
const hostileEmail = buildAdminReportEmail(hostile);
assert.ok(!hostileEmail.html.includes('<script>alert(1)</script>'));
assert.match(hostileEmail.html, /&lt;script&gt;/);

// --- recipients -------------------------------------------------------------
assert.deepEqual(reportRecipients({}), ['report@gershonconsulting.com']);
assert.deepEqual(
  reportRecipients({ ADMIN_REPORT_TO: 'report@gershonconsulting.com, olivier@gershonconsulting.com' }),
  ['report@gershonconsulting.com', 'olivier@gershonconsulting.com']
);
assert.equal(formatReportDate(new Date('2026-12-01T23:30:00Z')), 'December 1, 2026');

// --- sending ----------------------------------------------------------------
const withoutKey = await sendAdminDailyReport({ DB: fakeDb(fixtures) });
assert.deepEqual(withoutKey, { sent: 0, skipped: 'resend_not_configured', to: ['report@gershonconsulting.com'] });

const originalFetch = globalThis.fetch;
let sentPayload = null;
globalThis.fetch = async (url, init) => {
  sentPayload = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
  return new Response(JSON.stringify({ id: 'resend-message-1' }), { status: 200 });
};

const runStatements = [];
const sent = await sendAdminDailyReport({
  RESEND_API_KEY: 'test-key',
  DB: fakeDb(fixtures, { onRun: sql => runStatements.push(sql) })
});

assert.equal(sent.sent, 1);
assert.equal(sent.providerMessageId, 'resend-message-1');
assert.deepEqual(sent.to, ['report@gershonconsulting.com']);
assert.equal(sentPayload.url, 'https://api.resend.com/emails');
assert.deepEqual(sentPayload.body.to, ['report@gershonconsulting.com']);
assert.equal(sentPayload.body.from, 'GC NexaShare <nexashare@gershon.ai>');
assert.match(sentPayload.body.subject, /^NexaShare Extension Report — /);
assert.ok(sentPayload.body.html.length > 500);
assert.ok(runStatements.some(sql => sql.includes('INSERT INTO admin_daily_reports')), 'the send must be recorded');

// A provider failure is reported, recorded, and never thrown at the cron.
globalThis.fetch = async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 });
const failedStatements = [];
const failed = await sendAdminDailyReport({
  RESEND_API_KEY: 'test-key',
  DB: fakeDb(fixtures, { onRun: sql => failedStatements.push(sql) })
});
assert.equal(failed.sent, 0);
assert.equal(failed.failed, 1);
assert.equal(failed.error, 'domain not verified');
assert.ok(failedStatements.some(sql => sql.includes('INSERT INTO admin_daily_reports')));

// Already sent today: the cron must not send a second copy.
globalThis.fetch = async () => {
  throw new Error('should not send twice');
};
const guarded = await sendAdminDailyReport({
  RESEND_API_KEY: 'test-key',
  DB: fakeDb([{ match: 'FROM admin_daily_reports', rows: [{ sent: 1 }] }])
});
assert.deepEqual(guarded, { sent: 0, skipped: 'already_sent_today', to: ['report@gershonconsulting.com'] });

globalThis.fetch = originalFetch;

console.log('admin-report checks passed');

// ---- One date basis (America/New_York day) for the admin digest and per-user e-mails (nightly 2026-11-07) ----
// ET day boundaries, including the 25-hour day when DST ended (Nov 1, 2026).
assert.deepEqual(reportDayWindow(new Date('2026-11-06T06:00:00Z')),
  { day: '2026-11-05', timeZone: 'America/New_York', label: 'ET', from: '2026-11-05 05:00:00', to: '2026-11-06 05:00:00' });
assert.equal(reportDayWindow(new Date('2026-11-06T06:00:00Z'), 2).day, '2026-11-04');
const fallBack = reportDayWindow(new Date('2026-11-02T06:00:00Z'));
assert.equal(fallBack.from, '2026-11-01 04:00:00');
assert.equal(fallBack.to, '2026-11-02 05:00:00');
const springForward = reportDayWindow(new Date('2026-03-09T06:00:00Z'));
assert.equal(springForward.from, '2026-03-08 05:00:00');
assert.equal(springForward.to, '2026-03-09 04:00:00');
assert.equal(reportDayWindow(new Date('2026-07-01T06:00:00Z')).from, '2026-06-30 04:00:00');

const etSqlite = new DatabaseSync(':memory:');
etSqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, team_id INTEGER, created_at TEXT);
  CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE reposts (id INTEGER PRIMARY KEY, user_id INTEGER, team_id INTEGER, company_name TEXT, original_post_url TEXT,
    repost_url TEXT, post_text TEXT, status TEXT, detail TEXT, attempted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE extension_tokens (user_id INTEGER, extension_version TEXT, last_seen_at TEXT, created_at TEXT, revoked_at TEXT);
  CREATE TABLE daily_reports (user_id INTEGER, report_date TEXT);
  INSERT INTO users VALUES (1,'Olivier','olivier@example.com',1,'2026-01-01'),(2,'Amos','amos@example.com',2,'2026-01-01');
  INSERT INTO teams VALUES (1,'One'),(2,'Two');`);
const etInsert = etSqlite.prepare('INSERT INTO reposts (user_id, team_id, company_name, status, attempted_at) VALUES (?,?,?,?,?)');
// Inside the ET day 2026-11-05 (05:00Z Nov 5 → 05:00Z Nov 6):
etInsert.run(1, 1, 'Acme', 'failed', '2026-11-05T05:00:00Z');   // 00:00 ET, first second of the day
etInsert.run(1, 1, 'Acme', 'failed', '2026-11-06T03:00:00Z');   // 22:00 ET, after UTC midnight
etInsert.run(1, 1, 'Acme', 'confirmed', '2026-11-05 15:00:00'); // SQLite-style timestamp
etInsert.run(2, 2, 'Beta', 'confirmed', '2026-11-05T18:00:00Z');
// Outside it:
etInsert.run(1, 1, 'Acme', 'confirmed', '2026-11-05T04:30:00Z'); // 23:30 ET on Nov 4 → day before
etInsert.run(1, 1, 'Acme', 'failed', '2026-11-06T05:30:00Z');    // 00:30 ET on Nov 6 → not counted yet

const etDb = { prepare(sql) { const statement = etSqlite.prepare(sql); let args = []; return {
  bind(...values) { args = values; return this; },
  async first() { return statement.get(...args) || null; },
  async all() { return { results: statement.all(...args) }; },
  async run() { statement.run(...args); return { meta: { changes: 1 } }; } }; } };

const etNow = new Date('2026-11-06T06:00:00Z');
const basis = reportDayWindow(etNow, 1);
const previousBasis = reportDayWindow(etNow, 2);
const user1 = await collectDaySummary(etDb, 1, basis);
const user2 = await collectDaySummary(etDb, 2, basis);
assert.deepEqual([user1.confirmed, user1.failed], [1, 2], 'per-user report counts the ET day only');
assert.equal((await collectDaySummary(etDb, 1, previousBasis)).confirmed, 1, '23:30 ET on Nov 4 belongs to the day before');

const admin = await collectAdminReportData(etDb, { now: etNow });
assert.equal(admin.basis.day, '2026-11-05');
assert.equal(admin.today.confirmed, user1.confirmed + user2.confirmed, 'admin confirmed = sum of per-user confirmed');
assert.equal(admin.today.failed, user1.failed + user2.failed, 'admin failed = sum of per-user failed');
assert.equal(admin.yesterday.confirmed, 1);
const olivier = admin.userComparisons.find(row => row.id === 1);
assert.deepEqual([olivier.confirmed, olivier.failed, olivier.previous_confirmed], [1, 2, 1], 'admin per-user row matches the user e-mail');

const adminEmail = buildAdminReportEmail(admin);
assert.match(adminEmail.subject, /^NexaShare Extension Report — November 5, 2026 ET · 50% success · 2 confirmed, 2 failed$/);
assert.match(adminEmail.text, /Counts for 2026-11-05 ET · source /);
assert.match(adminEmail.html, /Counts for 2026-11-05 ET · source /);

const userEmail = buildDailyReport({ name: 'Olivier', email: 'olivier@example.com' }, [], [],
  { todaySummary: user1, previousSummary: await collectDaySummary(etDb, 1, previousBasis), basis, now: etNow, ranYesterday: true, extensionVersion: '1.2.33' });
assert.match(userEmail.subject, /NexaShare daily report · 2026-11-05 ET · 33\.3% success · 1 successful, 2 failed/);
assert.match(userEmail.text, /Counts for 2026-11-05 ET · source /);
assert.match(userEmail.html, /Counts for 2026-11-05 ET · source /);
assert.doesNotMatch(userEmail.subject + userEmail.text, /\bUTC\)|· UTC ·| UTC ·/, 'no UTC day label left in the user e-mail');
assert.equal(dateBasisFooter(basis, 'test source', etNow), 'Counts for 2026-11-05 ET · source test source · generated 2026-11-06 06:00:00 UTC');

console.log('Report date basis checks passed: one America/New_York day for admin and per-user e-mails, DST-safe, footer present.');
