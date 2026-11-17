import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { markDeliveryProcessing, recordDeliveryOutcome, canonicalDeliveryPostUrl } from '../src/delivery-engine.js';
import worker from '../src/index.js';

// Execute the production SQL against SQLite, including the unique conflict path.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE teams (id INTEGER PRIMARY KEY); CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO teams VALUES (1); INSERT INTO users VALUES (2), (3);');
sqlite.exec(readFileSync(new URL('../migrations/0006_delivery_engine.sql', import.meta.url), 'utf8'));
const db = { prepare(sql) { return { bind(...args) {
  const stmt = sqlite.prepare(sql);
  return {
    async run() { return { meta: { changes: stmt.run(...args).changes } }; },
    async first() { return stmt.get(...args); }
  };
} }; } };
const claim = { teamId: 1, userId: 2, postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7515313026304987136/' };
assert.deepEqual(await markDeliveryProcessing(db, claim), { acquired: true });
assert.deepEqual(await markDeliveryProcessing(db, claim), { acquired: false }, 'another device must not acquire an active post');
await recordDeliveryOutcome(db, { ...claim, outcome: { postUrl: claim.postUrl, status: 'confirmed' } });
assert.deepEqual(await markDeliveryProcessing(db, claim), { acquired: false }, 'published posts remain blocked after restart');
assert.deepEqual(await markDeliveryProcessing(db, { ...claim, postUrl: 'https://www.linkedin.com/posts/company_activity-7515313026304987136-abcd?tracking=1' }), { acquired: false }, 'post URL aliases share one reservation');
await recordDeliveryOutcome(db, { ...claim, outcome: { postUrl: claim.postUrl, status: 'failed', detail: 'late failed device' } });
assert.equal(sqlite.prepare('SELECT status FROM delivery_jobs WHERE user_id=2').get().status, 'published');
assert.equal(canonicalDeliveryPostUrl(claim.postUrl + '?tracking=1'), claim.postUrl);
assert.deepEqual(await markDeliveryProcessing(db, { ...claim, userId: 3 }), { acquired: true }, 'different members can repost the same original');
const uncertain = { ...claim, postUrl: claim.postUrl.replace('7515313026304987136', '7515313026304987137') };
await markDeliveryProcessing(db, uncertain);
await recordDeliveryOutcome(db, { ...uncertain, outcome: { postUrl: uncertain.postUrl, status: 'failed', detail: 'LinkedIn did not provide visible confirmation.' } });
assert.deepEqual(await markDeliveryProcessing(db, uncertain), { acquired: false }, 'uncertain clicks require review rather than automatic retry');
const transient = { ...claim, postUrl: claim.postUrl.replace('7515313026304987136', '7515313026304987138') };
await markDeliveryProcessing(db, transient);
await recordDeliveryOutcome(db, { ...transient, outcome: { postUrl: transient.postUrl, status: 'failed', detail: 'Network timeout before loading' } });
assert.deepEqual(await markDeliveryProcessing(db, transient), { acquired: true }, 'a known pre-click failure can retry');
// An old client ignores acquired=false. Deny it with HTTP 409 before any claim.
const routeEnv = { DB: { prepare(sql) {
  if (/FROM extension_tokens/.test(sql)) return { bind() { return { first: async () => ({ id: 2, team_id: 1 }) }; } };
  return db.prepare(sql);
} } };
for (const version of ['', '1.2.30', 'invalid']) {
  const response = await worker.fetch(new Request('https://nexashare.com/api/extension/deliveries/processing', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'X-NexaShare-Extension-Version': version },
    body: JSON.stringify({ postUrl: claim.postUrl })
  }), routeEnv);
  assert.equal(response.status, 409, `unsafe client ${version} must stop before posting`);
}
for (const expected of [true, false]) {
  const response = await worker.fetch(new Request('https://nexashare.com/api/extension/deliveries/processing', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'X-NexaShare-Extension-Version': '1.2.31' },
    body: JSON.stringify({ postUrl: claim.postUrl.replace('7515313026304987136', '7515313026304987139') })
  }), routeEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).acquired, expected);
}
sqlite.close();
console.log('Atomic delivery claim SQLite checks passed.');
