/**
 * Content regression guards for the static pages in public/.
 *
 * These three defects shipped to production and sat on the public landing page
 * for roughly two weeks before anyone caught them, so they get a test:
 *
 *   1. mojibake  - UTF-8 text decoded as Latin-1 somewhere in the build/copy
 *                  chain. It showed up as "Ã¢â‚¬â€" in <title>, a stray "Â"
 *                  before the copyright, and a broken ellipsis in every
 *                  loading state on the dashboard.
 *   2. duplicated sections - the "Why teams choose NexaShare" block was
 *                  rendered twice, identical, back to back.
 *   3. stale download link - the landing page offered extension 1.2.11 while
 *                  1.2.16 was the version actually shipping.
 *
 * Run: node tests/content-guards.mjs
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Sequences that can only exist if UTF-8 was decoded as Latin-1.
const MOJIBAKE = /Â[-¿]|â€.|Ãƒ|Ã¢|â(?!€)/g;

const entries = await readdir(PUBLIC_DIR);
const pages = entries.filter(name => name.endsWith('.html'));
assert.ok(pages.length > 0, 'expected HTML pages in public/');

// ---------------------------------------------------------------- 1. mojibake
for (const page of pages) {
  const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
  const hits = html.match(MOJIBAKE);
  assert.equal(
    hits,
    null,
    `${page}: ${hits?.length} mojibake sequence(s), first: ${JSON.stringify(hits?.[0])}`
  );
}

// ------------------------------------------------------- 2. duplicated blocks
for (const page of pages) {
  const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
  const headings = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(m => m[1].trim());
  const seen = new Set();
  for (const heading of headings) {
    assert.ok(!seen.has(heading), `${page}: section heading rendered twice: "${heading}"`);
    seen.add(heading);
  }
}

// --------------------------------------------- 3. extension download link is current
const shipped = entries
  .filter(name => /^nexashare-extension-\d+\.\d+\.\d+\.zip$/.test(name))
  .sort((a, b) => {
    const parse = n => n.match(/\d+/g).map(Number);
    const [x, y] = [parse(a), parse(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
assert.ok(shipped.length > 0, 'expected at least one packaged extension zip in public/');
const newest = shipped[shipped.length - 1];

for (const page of pages) {
  const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
  for (const [linked] of html.matchAll(/nexashare-extension-\d+\.\d+\.\d+\.zip/g)) {
    assert.equal(linked, newest, `${page}: links extension ${linked}, but ${newest} is the newest packaged build`);
  }
}

console.log(`content guards passed - ${pages.length} pages clean, extension link at ${newest}`);
