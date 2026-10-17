// New Chrome extension release notice to report@gershonconsulting.com.
// Run: node tests/release-notice.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RELEASE_NOTICE_FROM,
  buildReleaseNoticeEmail,
  compareVersions,
  sendExtensionReleaseNotice
} from '../src/extension-release-notice.js';
import { CURRENT_EXTENSION_VERSION, DAILY_REPORT_CRON } from '../src/worker.js';

assert.equal(compareVersions('1.2.27', '1.2.28'), -1);
assert.equal(compareVersions('1.2.28', '1.2.28'), 0);
assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
assert.equal(compareVersions(null, '1.2.28'), -1);

const clients = [
  { who: 'Olivier Attia', email: 'olivier@example.com', extension_version: '1.2.27', last_seen_at: '2026-10-17 12:00:00' },
  { who: 'Up To Date', email: 'ok@example.com', extension_version: '1.2.28', last_seen_at: '2026-10-17 12:00:00' },
  { who: 'Never Reported', email: 'old@example.com', extension_version: null, last_seen_at: null }
];
const email = buildReleaseNoticeEmail('1.2.28', clients);
assert.deepEqual(email.to, ['report@gershonconsulting.com']);
assert.match(email.from, /^GC /, 'Gershon internal report senders start with GC');
assert.equal(email.from, RELEASE_NOTICE_FROM);
assert.match(email.subject, /New Chrome extension available — NexaShare 1\.2\.28 — update all clients/);
assert.match(email.text, /needs to be downloaded and installed on ALL client computers/);
assert.match(email.text, /releases\/download\/extension-v1\.2\.28\/nexashare-extension-1\.2\.28\.zip/);
assert.match(email.text, /3 connected, 1 already on 1\.2\.28, 2 still need the update/);
assert.match(email.text, /Olivier Attia .*installed 1\.2\.27/);
assert.doesNotMatch(email.text, /Up To Date/);
assert.match(email.html, /Download NexaShare 1\.2\.28/);

function fakeDb(state) {
  return {
    prepare(sql) {
      const normalised = sql.replace(/\s+/g, ' ');
      let args = [];
      const statement = {
        bind: (...values) => { args = values; return statement; },
        run: async () => {
          if (normalised.startsWith('INSERT INTO extension_release_notices')) state.rows.set(args[0], { status: args[1] });
          return { meta: { changes: 1 } };
        },
        first: async () => state.rows.get(args[0]) || null,
        all: async () => ({ results: normalised.includes('FROM extension_tokens') ? clients : [] })
      };
      return statement;
    }
  };
}

const state = { rows: new Map() };
const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  return { ok: true, status: 200, json: async () => ({ id: 'msg_' + sent.length }) };
};
const env = { RESEND_API_KEY: 'test', DB: fakeDb(state) };

const first = await sendExtensionReleaseNotice(env, '1.2.28');
assert.equal(first.sent, 1);
assert.equal(sent.length, 1);
assert.equal(sent[0].url, 'https://api.resend.com/emails');
assert.deepEqual(sent[0].body.to, ['report@gershonconsulting.com']);

// Once per version: the next cron fires must not resend.
const second = await sendExtensionReleaseNotice(env, '1.2.28');
assert.equal(second.skipped, 'already_announced');
assert.equal(sent.length, 1);

// A new version announces again.
await sendExtensionReleaseNotice(env, '1.2.29');
assert.equal(sent.length, 2);
assert.match(sent[1].body.subject, /1\.2\.29/);

// A failed send is recorded and retried on the next fire.
const failState = { rows: new Map() };
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) });
const failed = await sendExtensionReleaseNotice({ RESEND_API_KEY: 'test', DB: fakeDb(failState) }, '1.2.30');
assert.equal(failed.status, 'failed');
assert.equal(failState.rows.get('1.2.30').status, 'failed');

// No key configured: skip quietly.
const noKey = await sendExtensionReleaseNotice({ DB: fakeDb({ rows: new Map() }) }, '1.2.28');
assert.equal(noKey.skipped, 'resend_not_configured');

// Wiring: the Worker checks on every cron and keeps reports on the daily fire only.
const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
assert.match(wrangler, /crons = \["0 6 \* \* \*", "\*\/30 \* \* \* \*"\]/);
assert.equal(DAILY_REPORT_CRON, '0 6 * * *');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.match(worker, /sendExtensionReleaseNotice\(env, CURRENT_EXTENSION_VERSION\)/);
assert.ok(CURRENT_EXTENSION_VERSION);

console.log('release-notice tests passed');
