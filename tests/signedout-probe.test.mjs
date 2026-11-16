// Signed-out homepage probe: no 401 (so no red console error); plain /api/user stays 401.
// Run: node tests/signedout-probe.test.mjs   (not in deploy.yml; CI list left untouched)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import entry from '../src/entry.js';

const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }) } };
const soft = await entry.fetch(new Request('https://nexashare.com/api/user', { headers: { 'X-Soft-Auth': '1' } }), env, {});
assert.equal(soft.status, 200);
assert.deepEqual(await soft.json(), { authenticated: false });
assert.equal((await entry.fetch(new Request('https://nexashare.com/api/user'), env, {})).status, 401);
assert.match(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), /X-Soft-Auth/);
console.log('Signed-out probe checks passed.');
