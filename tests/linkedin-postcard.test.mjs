// Fixture-based regression test for LinkedIn post-card readiness, discovery and in-place
// re-finding (1.2.29). The HTML fixtures in tests/fixtures are tiny SYNTHETIC snippets
// written by hand to resemble LinkedIn's feed markup; they are not captured pages.
// Run: node tests/linkedin-postcard.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../chrome-extension/sync-core.js', import.meta.url), 'utf8');
const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

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

// ---- Minimal DOM: just enough of the DOM API for the injected LinkedIn functions. ----
const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr']);

class Element {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.childNodes = [];
    this.parentElement = null;
    this.onClick = null;
    const self = this;
    this.classList = { contains: name => (self.getAttribute('class') || '').split(/\s+/).includes(name) };
  }
  get children() { return this.childNodes.filter(node => node instanceof Element); }
  get className() { return this.getAttribute('class') || ''; }
  get id() { return this.getAttribute('id') || ''; }
  get href() { const value = this.getAttribute('href'); return value == null ? '' : new URL(value, 'https://www.linkedin.com').href; }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  get hiddenInTree() { for (let node = this; node; node = node.parentElement) if (node.hasAttribute('hidden')) return true; return false; }
  get textContent() { return this.childNodes.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  get innerText() {
    if (this.hasAttribute('hidden')) return '';
    return this.childNodes.map(node => typeof node === 'string' ? node : node.innerText).join('\n');
  }
  descendants() { const out = []; const walk = node => { for (const child of node.children) { out.push(child); walk(child); } }; walk(this); return out; }
  querySelectorAll(selector) { return this.descendants().filter(node => matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (matches(node, selector)) return node; return null; }
  getBoundingClientRect() { return this.hiddenInTree ? { width: 0, height: 0 } : { width: 100, height: 20 }; }
  scrollIntoView() {}
  click() { this.clicked = (this.clicked || 0) + 1; if (this.onClick) this.onClick(); }
}

function parseHtml(html) {
  const root = new Element('#root');
  let current = root;
  const re = /<!--[^]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = re.exec(html))) {
    if (match[0].startsWith('<!--')) continue;
    if (match[4] !== undefined) { if (match[4].trim()) current.childNodes.push(match[4].replace(/\s+/g, ' ')); continue; }
    const [, closing, tag, rawAttrs] = match;
    if (closing) { if (current.parentElement) current = current.parentElement; continue; }
    const attrs = {};
    for (const [, name, value] of rawAttrs.matchAll(/([^\s=/]+)(?:="([^"]*)")?/g)) attrs[name] = value ?? '';
    const element = new Element(tag, attrs);
    element.parentElement = current;
    current.childNodes.push(element);
    if (!VOID.has(tag.toLowerCase()) && !rawAttrs.trim().endsWith('/')) current = element;
  }
  return root;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0; let quote = ''; let buffer = '';
  for (const char of value) {
    if (quote) { if (char === quote) quote = ''; buffer += char; continue; }
    if (char === '"' || char === "'") { quote = char; buffer += char; continue; }
    if (char === '[') depth++;
    if (char === ']') depth--;
    if (depth === 0 && separator.test(char)) { if (buffer.trim()) parts.push(buffer.trim()); buffer = ''; continue; }
    buffer += char;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

function matchesCompound(node, compound) {
  const re = /^([a-zA-Z][a-zA-Z0-9-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:([*^$]?=)"([^"]*)"(\s+i)?)?\]/g;
  let match; let consumed = 0;
  while ((match = re.exec(compound))) {
    if (match.index !== consumed) throw new Error(`Unsupported selector ${compound}`);
    consumed = re.lastIndex;
    if (match[1] && node.tagName !== match[1].toUpperCase()) return false;
    if (match[2] && !node.classList.contains(match[2])) return false;
    if (match[3] && node.id !== match[3]) return false;
    if (match[4]) {
      let value = node.getAttribute(match[4]);
      if (value == null) return false;
      if (!match[5]) continue;
      let wanted = match[6];
      if (match[7]) { value = value.toLowerCase(); wanted = wanted.toLowerCase(); }
      if (match[5] === '=' && value !== wanted) return false;
      if (match[5] === '*=' && !value.includes(wanted)) return false;
      if (match[5] === '^=' && !value.startsWith(wanted)) return false;
      if (match[5] === '$=' && !value.endsWith(wanted)) return false;
    }
  }
  if (consumed !== compound.length) throw new Error(`Unsupported selector ${compound}`);
  return true;
}

function matches(node, selector) {
  if (node.tagName === '#ROOT') return false;
  return splitTopLevel(selector, /,/).some(complex => {
    const compounds = splitTopLevel(complex, /\s/);
    if (!matchesCompound(node, compounds.at(-1))) return false;
    let ancestor = node.parentElement;
    for (let i = compounds.length - 2; i >= 0; i--) {
      while (ancestor && !(ancestor.tagName !== '#ROOT' && matchesCompound(ancestor, compounds[i]))) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  });
}

function loadPage(html, pathname = '/company/example/posts/') {
  const root = parseHtml(html);
  const document = {
    body: root.querySelector('body'),
    cookie: '',
    querySelectorAll: selector => root.querySelectorAll(selector),
    querySelector: selector => root.querySelector(selector),
    byId: id => root.querySelector(`#${id}`)
  };
  const location = { pathname, href: `https://www.linkedin.com${pathname}`, origin: 'https://www.linkedin.com' };
  const getComputedStyle = node => ({ visibility: 'visible', display: node.hiddenInTree ? 'none' : 'block' });
  const fns = new Function('document', 'location', 'getComputedStyle',
    `${extractFunction('inspectLinkedInPage')}\n${extractFunction('extractCompanyPageFromDOM')}\n${extractFunction('clickAndConfirmRepostInPlace')}\n` +
    'return { inspectLinkedInPage, extractCompanyPageFromDOM, clickAndConfirmRepostInPlace };'
  )(document, location, getComputedStyle);
  return { document, ...fns };
}

// ---- Case 1 (tcakir): "LinkedIn loaded, but its post-card layout was not recognized". ----
// Unrelated pressed toggles (Follow, notifications bell) used to make readiness report
// "ready" before any post card existed; extraction then found nothing and the run failed
// with linkedin_layout_unrecognized. Readiness must keep waiting instead.
{
  const page = loadPage(await fixture('linkedin-feed-not-ready.html'));
  const early = page.inspectLinkedInPage(false);
  assert.equal(early.ready, false, 'unrelated aria-pressed toggles must not mark LinkedIn as ready');
  assert.ok(!early.detectors.includes('semantic-control'));
  assert.equal(early.reason, '', 'non-final polls keep waiting without failing');
  assert.equal(page.inspectLinkedInPage(true).reason, 'linkedin_layout_unrecognized');
}

// A current-style card whose activity id is only in data-chameleon-result-urn is
// recognised as ready and yields a real activity id (normal post-URL repost path).
{
  const page = loadPage(await fixture('linkedin-feed-current-card.html'));
  const readiness = page.inspectLinkedInPage(false);
  assert.equal(readiness.ready, true);
  assert.ok(readiness.detectors.includes('structural-card'));
  const extracted = page.extractCompanyPageFromDOM();
  assert.equal(extracted.posts.length, 1);
  assert.equal(extracted.posts[0].id, '7515313026304987136');
  assert.equal(extracted.posts[0].url, 'https://www.linkedin.com/feed/update/urn:li:activity:7515313026304987136/');
  assert.ok(!extracted.posts[0].inPlace, 'posts with a real activity id must not use the in-place path');
  assert.equal(extracted.posts[0].alreadyReposted, false);
}

// ---- Case 2 (markus): "could not find this post again on the LinkedIn page". ----
// Discovery found the post with its text-hash fallback (no activity id), but the in-place
// repost only looked for an "Open control menu" anchor plus an exact aria-label, so it
// never re-found the card it had just discovered.
{
  const html = await fixture('linkedin-feed-inplace-card.html');
  const page = loadPage(html);
  const extracted = page.extractCompanyPageFromDOM();
  assert.equal(extracted.posts.length, 2);
  assert.ok(extracted.posts.every(post => post.inPlace && post.matchText));
  const target = extracted.posts.find(post => /assay platform/.test(post.matchText));
  assert.ok(target, 'first post discovered by text');

  const repost1 = page.document.byId('repost1');
  const repost2 = page.document.byId('repost2');
  const share1 = page.document.byId('share1');
  repost1.onClick = () => page.document.byId('menu1').removeAttribute('hidden');
  page.document.byId('instant1').onClick = () => repost1.setAttribute('aria-pressed', 'true');

  const outcome = await page.clickAndConfirmRepostInPlace(target.matchText);
  assert.equal(outcome.confirmed, true, outcome.detail);
  assert.equal(repost1.clicked, 1, 'the matching post\'s Repost button is used');
  assert.equal(page.document.byId('instant1').clicked, 1, 'the direct "Repost instantly" choice is used');
  assert.ok(!share1.clicked, 'a plain Share/Teilen button is never clicked as a repost');
  assert.ok(!repost2.clicked, 'the other post is never touched');
}

// Safety: a post that really is gone still reports the original message and clicks nothing.
{
  const page = loadPage(await fixture('linkedin-feed-inplace-card.html'));
  const outcome = await page.clickAndConfirmRepostInPlace('A completely different post that is no longer on this page at all.');
  assert.equal(outcome.confirmed, false);
  assert.match(outcome.detail, /could not find this post again/);
  assert.ok(page.document.querySelectorAll('button, [role="button"]').every(node => !node.clicked));
}

console.log('linkedin post-card fixture checks passed');
