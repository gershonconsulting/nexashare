import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = path => readFile(new URL(`../${path}`, import.meta.url));
const text = async path => (await read(path)).toString('utf8');
function pngSize(bytes, size) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}
const source = await read('public/branding/nexashare-source.png');
assert.equal(createHash('sha256').update(source).digest('hex'), 'de7b1bd1455a2fb6691d82b93a8274e119c736048f6278b186bb9b3bddbf3d2c');
pngSize(source, 200);
for (const size of [16, 32, 48, 180, 192, 512]) pngSize(await read(`public/branding/nexashare-${size}.png`), size);
const manifest = JSON.parse(await text('public/manifest.webmanifest'));
assert.equal(manifest.name, 'NexaShare');
assert.equal(manifest.start_url, '/dashboard.html');
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
for (const icon of manifest.icons) pngSize(await read(`public${icon.src}`), Number(icon.sizes.split('x')[0]));
const extension = JSON.parse(await text('chrome-extension/manifest.json'));
for (const size of [16, 32, 48, 128]) {
  assert.equal(extension.action.default_icon[size], extension.icons[size]);
  const bytes = await read(`chrome-extension/${extension.icons[size]}`);
  pngSize(bytes, size);
  if (size !== 128) assert.deepEqual(bytes, await read(`public/branding/nexashare-${size}.png`));
}
const favicon = await read('public/favicon.ico');
assert.equal(favicon.readUInt16LE(2), 1);
assert.equal(favicon.readUInt16LE(4), 3);
for (let index = 0; index < 3; index++) {
  const entry = 6 + index * 16;
  const size = [16, 32, 48][index];
  assert.equal(favicon[entry], size);
  const offset = favicon.readUInt32LE(entry + 12);
  const bytes = favicon.subarray(offset, offset + favicon.readUInt32LE(entry + 8));
  pngSize(bytes, size);
  assert.deepEqual(bytes, await read(`public/branding/nexashare-${size}.png`));
}
for (const page of (await readdir(new URL('../public/', import.meta.url))).filter(name => name.endsWith('.html'))) {
  const html = await text(`public/${page}`);
  assert.match(html, /<img class="nexashare-mark"[^>]*src="\/branding\/nexashare-48\.png"/);
  assert.doesNotMatch(html, /<(?:div|span) class="(?:logo-icon|nav-logo|brand-mark|logo|mark)">N<\//);
  for (const asset of ['/favicon.ico', '/branding/nexashare-32.png', '/branding/nexashare-180.png', '/manifest.webmanifest', '/branding.css']) {
    assert.ok(html.includes(`href="${asset}"`), `${page}: missing ${asset}`);
    assert.ok((await read(`public${asset}`)).length);
  }
}
assert.match(await text('chrome-extension/popup.html'), /<img src="icons\/icon48.png"/);
for (const path of ['src/worker.js', 'src/index.js', 'public/dashboard.html']) assert.ok((await text(path)).includes(`'${extension.version}'`));
assert.ok((await text('src/extension-release-notice.js')).includes(`'${extension.version}':`));
console.log('Canonical source, PNG sizes, favicon payloads, PWA, page branding and extension release consistency passed.');
