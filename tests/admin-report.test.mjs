import assert from 'node:assert/strict';
import {
  ADMIN_REPORT_TO,
  buildAdminReportEmail,
  collectAdminReportData,
  formatReportDate,
  sendAdminDailyReport
} from '../src/admin-report.js';

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
assert.equal(email.subject, 'NexaShare Extension Report — September 3, 2026');
assert.equal(email.to, ADMIN_REPORT_TO);
assert.equal(email.from, 'NexaShare <nexashare@gershon.ai>');
assert.match(email.html, /12 confirmed, 3 failed, 3 skipped across 4 active extensions/);
assert.match(email.html, /Repost button not found/);
assert.match(email.html, /Needs attention/);
assert.match(email.html, /2 delivery jobs are queued for retry/);
assert.match(email.html, /Dormant Tester/);
assert.match(email.text, /NexaShare Extension Report — September 3, 2026/);
assert.match(email.text, /- Confirmed reposts: 12/);
assert.match(email.text, /- Success rate: 80%/);
assert.ok(!email.html.includes('undefined'), 'rendered report must not leak undefined');

// Quiet day: the report still goes out and says so loudly.
const quiet = await collectAdminReportData(fakeDb([]));
const quietEmail = buildAdminReportEmail(quiet, { date: new Date('2026-09-03T06:00:00Z') });
assert.match(quietEmail.html, /No extension activity was recorded in the last 24 hours/);
assert.match(quietEmail.html, /check that the extension is installed/);
assert.match(quietEmail.text, /- Success rate: n\/a/);

// HTML injection from a scraped company name must not escape into markup.
const hostile = await collectAdminReportData(fakeDb([
  { match: 'Unnamed source', rows: [{ source: '<script>alert(1)</script>', confirmed: 0, failed: 1, attempts: 1 }] }
]));
const hostileEmail = buildAdminReportEmail(hostile);
assert.ok(!hostileEmail.html.includes('<script>alert(1)</script>'));
assert.match(hostileEmail.html, /&lt;script&gt;/);

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
assert.equal(sentPayload.body.from, 'NexaShare <nexashare@gershon.ai>');
assert.match(sentPayload.body.subject, /^NexaShare Extension Report — /);
assert.ok(sentPayload.body.html.length > 500);
assert.ok(runStatements.some(sql => sql.includes('INSERT INTO admin_daily_reports')), 'the send must be recorded');

// Daily administrator delivery follows the persisted setting, not a hard-coded mailbox.
sentPayload = null;
const configuredRecipient = await sendAdminDailyReport({
  RESEND_API_KEY: 'test-key',
  DB: fakeDb([{ match: 'FROM report_settings', rows: [{ recipient_email: 'daily-ops@example.com' }] }, ...fixtures])
}, { force: true });
assert.equal(configuredRecipient.sent, 1);
assert.deepEqual(sentPayload.body.to, ['daily-ops@example.com']);

// A malformed stored value pauses the admin report instead of falling back silently.
const invalidRecipient = await sendAdminDailyReport({
  RESEND_API_KEY: 'test-key',
  DB: fakeDb([{ match: 'FROM report_settings', rows: [{ recipient_email: 'broken-address' }] }])
});
assert.deepEqual(invalidRecipient, { sent: 0, skipped: 'report_recipient_not_configured', to: [] });

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
