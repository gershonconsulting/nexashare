import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
import { buildProgress } from '../src/admin-progress.js';

// The daily send query must exclude users whose switch is OFF.
const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.match(src, /COALESCE\(u\.daily_report_enabled, 1\) = 1/, 'daily send must skip users with the switch OFF');

// Migration puts Anne (user 7) on OFF.
const mig = readFileSync(new URL('../migrations/0015_daily_report_optout.sql', import.meta.url), 'utf8');
assert.match(mig, /ADD COLUMN daily_report_enabled INTEGER NOT NULL DEFAULT 1/);
assert.match(mig, /SET daily_report_enabled = 0\s+WHERE id = 7 AND lower\(email\) = 'abougel@altavia\.co'/);

// Admin payload exposes the switch (missing column => ON).
const p = buildProgress({ users: [
  { id: 7, name: 'Anne', email: 'a@x', daily_report_enabled: 0 },
  { id: 1, name: 'Olivier', email: 'o@x', daily_report_enabled: 1 },
  { id: 2, name: 'Legacy', email: 'l@x' }
], days: 7 });
const by = Object.fromEntries(p.users.map(u => [u.id, u.daily_report_enabled]));
assert.deepEqual(by, { 7: false, 1: true, 2: true });

// Admin switch rejects non-admins / bad origin / wrong method.
const req = (method, origin) => new Request('https://nexashare.com/api/admin/daily-report-switch', { method, headers: origin ? { Origin: origin } : {} });
assert.equal((await worker.fetch(req('GET'), {}, {})).status, 405);
assert.equal((await worker.fetch(req('POST', 'https://evil.example'), {}, {})).status, 403);
assert.equal((await worker.fetch(req('POST', 'https://nexashare.com'), {}, {})).status, 401);

console.log('daily-report switch checks passed');
