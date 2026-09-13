import assert from 'node:assert/strict';
import { buildWeeklyAdminEmail, buildWeeklyUserEmail, isSunday, sendSundayReports, weeklyHealth, weekKey } from '../src/weekly-report.js';

const current = '1.2.18';
assert.equal(isSunday(new Date('2026-09-13T06:00:00Z')), true);
assert.equal(isSunday(new Date('2026-09-14T06:00:00Z')), false);
assert.equal(weekKey(new Date('2026-09-13T06:00:00Z')), '2026-09-06_2026-09-13');

assert.equal(weeklyHealth({ extensionVersion: current, runDays: 7, confirmed: 3, failed: 0 }, current).code, 'green');
assert.equal(weeklyHealth({ extensionVersion: current, runDays: 5, confirmed: 3, failed: 0 }, current).code, 'orange');
assert.equal(weeklyHealth({ extensionVersion: current, runDays: 7, confirmed: 0, failed: 0 }, current).code, 'orange');
assert.equal(weeklyHealth({ extensionVersion: current, runDays: 2, confirmed: 0, failed: 2 }, current).code, 'red');
assert.equal(weeklyHealth({ extensionVersion: null, runDays: 0, confirmed: 0, failed: 0 }, current).code, 'red');

const user = { id: 1, name: 'Olivier Attia', email: 'olivier@example.com' };
const activity = { extensionVersion: current, lastSeenAt: '2026-09-13 05:00:00', runDays: 7, confirmed: 2, failed: 0, skipped: 1, outcomes: [{ company_name: 'Example', status: 'confirmed', repost_url: 'https://linkedin.com/repost/1' }] };
const userEmail = buildWeeklyUserEmail(user, activity, current, new Date('2026-09-13T06:00:00Z'));
assert.match(userEmail.subject, /✅ NexaShare weekly report/);
assert.match(userEmail.text, /Extension run days: 7\/7/);
assert.match(userEmail.html, /v1\.2\.18/);

const adminEmail = buildWeeklyAdminEmail([
  { ...user, ...activity },
  { id: 2, name: 'No Run', email: 'norun@example.com', extensionVersion: current, lastSeenAt: null, runDays: 0, confirmed: 0, failed: 0, skipped: 0 }
], current, new Date('2026-09-13T06:00:00Z'));
assert.match(adminEmail.subject, /1 green, 0 orange, 1 red/);
assert.match(adminEmail.text, /Every user/);
assert.match(adminEmail.html, /No Run/);
assert.match(adminEmail.html, /Last seen/);

const sent = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  sent.push({ headers: options.headers, body: JSON.parse(options.body) });
  return new Response(JSON.stringify({ id: `email-${sent.length}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const db = {
  prepare(sql) {
    return {
      bind() { return this; },
      async all() {
        if (sql.includes('FROM users')) return { results: [user] };
        if (sql.includes('SELECT company_name')) return { results: activity.outcomes };
        throw new Error(`Unexpected all query: ${sql}`);
      },
      async first() {
        if (sql.includes('SUM(CASE')) return activity;
        if (sql.includes('COUNT(DISTINCT')) return { days: 7 };
        if (sql.includes('FROM extension_tokens')) return { extension_version: current, last_seen_at: activity.lastSeenAt };
        throw new Error(`Unexpected first query: ${sql}`);
      }
    };
  }
};
const sundayResult = await sendSundayReports({ DB: db, RESEND_API_KEY: 'test' }, current, { date: new Date('2026-09-13T06:00:00Z') });
assert.deepEqual(sundayResult, { userReportsSent: 1, adminReportSent: 1, failed: 0, eligibleUsers: 1 });
assert.equal(sent.length, 2);
assert.equal(sent[0].body.to[0], user.email);
assert.equal(sent[1].body.to[0], 'report@gershonconsulting.com');
assert.match(sent[0].headers['Idempotency-Key'], /nexashare-weekly-user-1/);
globalThis.fetch = originalFetch;

console.log('Weekly report tests passed');
