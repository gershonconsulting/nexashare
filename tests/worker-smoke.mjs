import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.js';

const env = {
  DB: {
    prepare() {
      throw new Error('Unauthenticated smoke routes must not query D1');
    }
  },
  ASSETS: { fetch: request => new Response(`asset:${new URL(request.url).pathname}`) }
};

const unauthenticated = await worker.fetch(new Request('https://nexashare.com/api/user'), env);
assert.equal(unauthenticated.status, 401);
assert.deepEqual(await unauthenticated.json(), { error: 'Not authenticated' });

const missingIngestToken = await worker.fetch(new Request(
  'https://nexashare.com/api/extension/ingest',
  { method: 'POST', body: JSON.stringify({ outcomes: [] }), headers: { 'Content-Type': 'application/json' } }
), env);
assert.equal(missingIngestToken.status, 401);

const missingSubscriptionSession = await worker.fetch(new Request('https://nexashare.com/api/subscription'), env);
assert.equal(missingSubscriptionSession.status, 401);

const preflight = await worker.fetch(new Request(
  'https://nexashare.com/api/extension/ingest',
  { method: 'OPTIONS' }
), env);
assert.equal(preflight.status, 204);

const asset = await worker.fetch(new Request('https://nexashare.com/dashboard.html'), env);
assert.equal(await asset.text(), 'asset:/dashboard.html');

const healthyEnv = {
  ...env,
  DB: {
    prepare(sql) {
      assert.equal(sql, 'SELECT 1 AS ok');
      return { first: async () => ({ ok: 1 }) };
    }
  }
};
const health = await worker.fetch(new Request('https://nexashare.com/api/health'), healthyEnv);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ready');

const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const extensionSource = await readFile(new URL('../chrome-extension/sync-core.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../chrome-extension/manifest.json', import.meta.url), 'utf8'));
const dashboardSource = await readFile(new URL('../public/dashboard.html', import.meta.url), 'utf8');
assert.match(workerSource, /openid profile email/);
assert.doesNotMatch(workerSource, /w_member_social|ugcPosts|\/v2\/shares/);
assert.match(workerSource, /UPDATE companies SET enabled/);
assert.match(workerSource, /https:\/\/buy\.stripe\.com\/5kQdRb1rc6mvfcZ8yvcfK00/);
assert.match(workerSource, /enforcement: 'not_configured'/);
assert.match(extensionSource, /LinkedIn visibly changed the repost control/);
assert.match(extensionSource, /chrome\.alarms/);
assert.match(extensionSource, /periodInMinutes: 1440/);
assert.match(extensionSource, /processedPostIds/);
assert.match(extensionSource, /pendingOutcomes/);
assert.equal(manifest.version, '1.2.0');
assert.ok(manifest.permissions.includes('alarms'));
assert.match(dashboardSource, /EXPECTED_EXTENSION_VERSION\s*=\s*'1\.2\.0'/);
assert.match(dashboardSource, /Load unpacked/);
assert.match(dashboardSource, /Not detected/);

console.log('Worker and extension smoke checks passed.');
