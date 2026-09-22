import assert from 'node:assert/strict';
import worker, { CURRENT_EXTENSION_VERSION } from '../src/worker.js';
import { buildProgress, clampDays, dayRange, isPlatformAdmin, platformAdminEmails } from '../src/admin-progress.js';

// ------------------------------------------------------------ access control
assert.deepEqual(platformAdminEmails({}), ['oattia@gmail.com']);
assert.deepEqual(platformAdminEmails({ PLATFORM_ADMIN_EMAILS: ' A@x.com, b@y.com ' }), ['a@x.com', 'b@y.com']);
assert.equal(isPlatformAdmin({ email: 'OAttia@gmail.com', role: 'admin' }, {}), true);
assert.equal(isPlatformAdmin({ email: 'client@acme.com', role: 'admin' }, {}), false, 'team admin is not a platform admin');
assert.equal(isPlatformAdmin({ email: '' }, {}), false);

assert.equal(clampDays('abc'), 30);
assert.equal(clampDays('2'), 7);
assert.equal(clampDays('9999'), 180);
assert.equal(clampDays('14'), 14);

const today = new Date('2026-09-22T15:00:00Z');
const range = dayRange(14, today);
assert.equal(range.length, 14);
assert.equal(range[0], '2026-09-09');
assert.equal(range[13], '2026-09-22');

// ------------------------------------------------------------ aggregation
const p = buildProgress({
  days: 14,
  today,
  users: [
    { id: 1, name: 'Olivier', email: 'o@x.com', team_id: 10, team_name: 'Gershon', created_at: '2026-08-01' },
    { id: 2, name: 'Stalled Sam', email: 's@x.com', team_id: 20, team_name: 'Acme' },
    { id: 3, name: 'New Nora', email: 'n@x.com', team_id: 30 }
  ],
  daily: [
    { user_id: 1, day: '2026-09-21', status: 'confirmed', n: 3 },
    { user_id: 1, day: '2026-09-21', status: 'failed', n: 1 },
    { user_id: 1, day: '2026-09-21', status: 'already_reposted', n: 2 },
    { user_id: 1, day: '2026-09-10', status: 'confirmed', n: 1 },
    { user_id: 2, day: '2026-09-12', status: 'confirmed', n: 2 },
    { user_id: 2, day: '2026-09-20', status: 'skipped', n: 4 },
    { user_id: 1, day: '2026-08-01', status: 'confirmed', n: 99 }, // outside range: ignored
    { user_id: 99, day: '2026-09-21', status: 'confirmed', n: 5 }  // unknown user: ignored
  ],
  totals: [
    { user_id: 1, status: 'confirmed', n: 104, last_confirmed_at: '2026-09-21T09:00:00Z', last_attempt_at: '2026-09-21T09:00:00Z' },
    { user_id: 1, status: 'failed', n: 1, last_confirmed_at: null, last_attempt_at: '2026-09-21T09:00:00Z' },
    { user_id: 2, status: 'confirmed', n: 2, last_confirmed_at: '2026-09-12 10:00:00', last_attempt_at: '2026-09-20' }
  ],
  extensions: [{ user_id: 1, extension_version: '1.2.18', last_seen_at: '2026-09-22 06:00:00' }],
  companies: [{ team_id: 10, n: 4 }]
});

assert.equal(p.platform.series.length, 14);
const d21 = p.platform.series.find(d => d.day === '2026-09-21');
assert.deepEqual([d21.confirmed, d21.failed, d21.skipped], [3, 1, 2], 'already_reposted counts as skipped');
assert.equal(p.platform.period.confirmed, 6);
assert.equal(p.platform.period.failed, 1);
assert.equal(p.platform.period.rate, 86, 'rate = confirmed / (confirmed + failed)');
assert.equal(p.platform.series.at(-1).cumulative_confirmed, 6);
assert.equal(p.platform.last7.confirmed, 3);
assert.equal(p.platform.prev7.confirmed, 3);

const [first] = p.users;
assert.equal(first.id, 1, 'sorted by confirmed in period');
assert.equal(first.status, 'healthy');
assert.equal(first.companies, 4);
assert.equal(first.extension_version, '1.2.18');
assert.equal(first.all_time.confirmed, 104);
assert.equal(first.period.confirmed, 4);

const sam = p.users.find(u => u.id === 2);
assert.equal(sam.status, 'stalled', 'confirmed 10 days ago, nothing since');
assert.equal(sam.last7.confirmed, 0);
assert.equal(sam.trend, -2);
assert.equal(sam.period.rate, 100);

const nora = p.users.find(u => u.id === 3);
assert.equal(nora.status, 'no_results');
assert.equal(nora.period.rate, null);
assert.equal(nora.companies, 0);

assert.equal(p.platform.healthy, 1);
assert.equal(p.platform.stalled, 1);
assert.equal(p.platform.no_results, 1);
assert.equal(p.platform.last_confirmed_at, '2026-09-21T09:00:00Z');

// ------------------------------------------------------------ route
const noDb = { DB: { prepare() { throw new Error('must not query D1 unauthenticated'); } }, ASSETS: { fetch: () => new Response('') } };
const unauth = await worker.fetch(new Request('https://nexashare.com/api/admin/progress'), noDb);
assert.equal(unauth.status, 401);

function fakeEnv(email) {
  const calls = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          calls.push(sql);
          const stmt = {
            bind: () => stmt,
            first: async () => (sql.includes('FROM sessions') ? { id: 7, email, role: 'admin', team_id: 1 } : null),
            all: async () => ({ results: sql.includes('FROM users u LEFT JOIN teams') ? [{ id: 7, name: 'X', email, team_id: 1 }] : [] })
          };
          return stmt;
        }
      },
      ASSETS: { fetch: () => new Response('') }
    }
  };
}
const cookie = { headers: { Cookie: 'session=abc' } };

const teamAdmin = fakeEnv('client@acme.com');
const forbidden = await worker.fetch(new Request('https://nexashare.com/api/admin/progress', cookie), teamAdmin.env);
assert.equal(forbidden.status, 403, 'a team admin must not see other customers');
assert.equal(teamAdmin.calls.some(sql => sql.includes('FROM reposts')), false, 'no repost data read for non-admins');

const owner = fakeEnv('oattia@gmail.com');
const ok = await worker.fetch(new Request('https://nexashare.com/api/admin/progress?days=14', cookie), owner.env);
assert.equal(ok.status, 200);
const body = await ok.json();
assert.equal(body.days, 14);
assert.equal(body.users.length, 1);
assert.equal(body.platform.series.length, 14);

assert.equal(body.current_extension_version, CURRENT_EXTENSION_VERSION);

// Other routes still reach the app.
const other = await worker.fetch(new Request('https://nexashare.com/api/user'), noDb);
assert.equal(other.status, 401);

console.log('admin-progress: PASS');
