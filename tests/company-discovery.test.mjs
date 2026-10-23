// Regression test for 1.2.28 data-first company discovery.
// Run: node tests/company-discovery.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../chrome-extension/sync-core.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start !== -1, `${name} must exist in sync-core.js`);
  let depth = 0;
  let opened = false;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') { depth++; opened = true; }
    if (source[i] === '}') depth--;
    if (opened && depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const helpers = new Function(
  `${extractFunction('activityTimeMs')}\n${extractFunction('sortPostsNewestFirst')}\n` +
  `${extractFunction('discoverCompanyPostsViaData')}\n` +
  'return { activityTimeMs, sortPostsNewestFirst, discoverCompanyPostsViaData };'
)();

// Snowflake ids decode to publish time (verified live against MAbSilico on 2026-10-17).
assert.equal(new Date(helpers.activityTimeMs('7515313026304987136')).toISOString().slice(0, 16), '2026-10-12T07:30');
assert.equal(helpers.activityTimeMs('t1abc'), 0);

// LinkedIn's company feed is not chronological; NexaShare must act on the newest post first.
const feedOrder = ['7515313026304987136', '7511326459089698816', '7512791310504792065', '7472954520310906880'].map(id => ({ id }));
assert.deepEqual(helpers.sortPostsNewestFirst(feedOrder).map(post => post.id), [
  '7515313026304987136', '7512791310504792065', '7511326459089698816', '7472954520310906880'
]);
// Text-hash ids (DOM fallback) keep their original order.
const hashed = [{ id: 'tb' }, { id: 'ta' }];
assert.deepEqual(helpers.sortPostsNewestFirst(hashed), hashed);

// discoverCompanyPostsViaData against a mocked LinkedIn session.
const html = '<code>{&quot;entityUrn&quot;:&quot;urn:li:fsd_company:18152652&quot;,&quot;universalName&quot;:&quot;mabsilico&quot;}' +
  ' voyagerFeedDashOrganizationalPageUpdates.22f65769d754b16c73f7c9d9a8d2fd46 urn:li:fsd_company:999</code>';
const api = JSON.stringify({ included: [
  { entityUrn: 'urn:li:activity:7511326459089698816' },
  { entityUrn: 'urn:li:activity:7515313026304987136' },
  { entityUrn: 'urn:li:activity:7515313026304987136' }
] });
const calls = [];
globalThis.document = { cookie: 'lang=v=2; JSESSIONID="ajax:123"; li_at=x' };
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  const body = url.startsWith('/company/') ? html : api;
  return { ok: true, status: 200, url: 'https://www.linkedin.com' + url.split('?')[0], text: async () => body };
};

const found = await helpers.discoverCompanyPostsViaData('mabsilico');
assert.equal(found.ok, true, found.reason);
assert.deepEqual(found.posts.map(post => post.id), ['7515313026304987136', '7511326459089698816']);
assert.equal(found.posts[0].url, 'https://www.linkedin.com/feed/update/urn:li:activity:7515313026304987136/');
assert.match(calls[1].url, /organizationalPage%3A18152652\)/, 'uses the page id nearest the vanity, not other companies on the page');
assert.match(calls[1].url, /queryId=voyagerFeedDashOrganizationalPageUpdates\.22f65769/);
assert.equal(calls[1].options.headers['csrf-token'], 'ajax:123');

// Signed-out sessions must fall back cleanly, never throw.
globalThis.document = { cookie: '' };
const signedOut = await helpers.discoverCompanyPostsViaData('mabsilico');
assert.equal(signedOut.ok, false);
assert.equal(signedOut.reason, 'no_csrf');

// The sync loop must try data discovery before the DOM parser for company sources.
assert.match(source, /func: discoverCompanyPostsViaData/);
assert.ok(source.indexOf('func: discoverCompanyPostsViaData') < source.indexOf('const readiness = await waitForLinkedInPosts(tabId);'));

console.log('company-discovery tests passed');
