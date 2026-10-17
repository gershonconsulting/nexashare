// New Chrome extension release notice to report@gershonconsulting.com.
// Run: node tests/release-notice.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RELEASE_NOTICE_FROM,
  buildReleaseNoticeEmail,
  compareVersions,
  sendExtensionReleaseNotice,
  checkWatchedExtensions,
  WATCHED_EXTENSIONS
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


// ---- Other platforms' extensions (Social, Radar, Pulse) ----
const social = WATCHED_EXTENSIONS.find(item => item.app === 'social');
assert.equal(social.parse(JSON.stringify({ success: true, data: { latest: '0.20.0', downloadUrl: '/social-extension-v0.20.0.zip', releaseNotes: 'x' } })).download,
  'https://social.gershon.ai/social-extension-v0.20.0.zip');
const radar = WATCHED_EXTENSIONS.find(item => item.app === 'radar');
assert.equal(radar.parse("<script>const LATEST_EXT_VERSION = '1.15.0';</script>").version, '1.15.0');
const pulse = WATCHED_EXTENSIONS.find(item => item.app === 'pulse');
assert.equal(pulse.parse(JSON.stringify({ latest: '1.19.0', downloadUrl: 'https://pulse.gershoncrm.com/pulse-extension.zip' })).version, '1.19.0');

function watchDb(rows) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind: (...values) => { args = values; return statement; },
        run: async () => { if (/INSERT INTO extension_release_watch/.test(sql)) rows.set(args[0], { last_version: args[1], status: args[2] }); return {}; },
        first: async () => rows.get(args[0]) || null
      };
      return statement;
    }
  };
}
const watched = [{ app: 'radar', name: 'Radar', url: 'https://radar.example/', setup: 'https://radar.example/', parse: radar.parse }];
let radarVersion = '1.15.0';
let mails = [];
let resendOk = true;
globalThis.fetch = async (url, init) => {
  if (url === 'https://api.resend.com/emails') {
    mails.push(JSON.parse(init.body));
    return resendOk ? { ok: true, status: 200, json: async () => ({ id: 'm' + mails.length }) } : { ok: false, status: 500, json: async () => ({ message: 'down' }) };
  }
  return { ok: true, status: 200, text: async () => `const LATEST_EXT_VERSION = '${radarVersion}';` };
};
const rows = new Map();
const watchEnv = { RESEND_API_KEY: 'k', DB: watchDb(rows) };
assert.deepEqual(await checkWatchedExtensions(watchEnv, watched), [{ app: 'radar', baseline: '1.15.0' }]);
assert.equal(mails.length, 0, 'first sighting is a baseline, not a release');
assert.deepEqual(await checkWatchedExtensions(watchEnv, watched), [{ app: 'radar', unchanged: '1.15.0' }]);
radarVersion = '1.16.0';
resendOk = false;
assert.equal((await checkWatchedExtensions(watchEnv, watched))[0].status, 'failed');
assert.equal(rows.get('radar').last_version, '1.15.0', 'failed send leaves the old version so it retries');
resendOk = true;
const announced = await checkWatchedExtensions(watchEnv, watched);
assert.equal(announced[0].sent, '1.16.0');
assert.match(mails.at(-1).subject, /New Chrome extension available — Radar 1\.16\.0 — update all clients/);
assert.match(mails.at(-1).from, /^GC /);
assert.deepEqual(mails.at(-1).to, ['report@gershonconsulting.com']);
const sentCount = mails.length;
await checkWatchedExtensions(watchEnv, watched);
assert.equal(mails.length, sentCount, 'announced once per version');
assert.deepEqual(await checkWatchedExtensions({ DB: watchDb(new Map()) }, watched), [], 'no key: no network, nothing to do');

console.log('release-notice tests passed');
