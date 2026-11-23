import assert from 'node:assert/strict';
import { buildDailyReport, summarize, CURRENT_EXTENSION_VERSION } from '../src/worker.js';

const user = { email: 'olivier@example.com', name: 'Olivier Attia' };

const row = (status, extra = {}) => ({
  status,
  company_name: extra.company || 'Acme',
  original_post_url: 'https://www.linkedin.com/feed/update/1',
  repost_url: status === 'confirmed' ? 'https://www.linkedin.com/feed/update/2' : null,
  detail: extra.detail || null,
  attempted_at: '2026-09-05T09:00:00Z'
});

// ---------------------------------------------------------------- summarize
{
  const s = summarize([
    row('confirmed'), row('confirmed'), row('failed'),
    row('skipped'), row('already_reposted'),
    row('confirmed', { company: 'Globex' })
  ]);
  assert.equal(s.processed, 6);
  assert.equal(s.confirmed, 3);
  assert.equal(s.failed, 1);
  assert.equal(s.skipped, 2);
  assert.equal(s.companies, 2);
  // Rate is confirmed / (confirmed + failed) — skips are not attempts.
  assert.equal(s.rate, 75);
}
{
  const s = summarize([row('skipped'), row('already_reposted')]);
  assert.equal(s.rate, null, 'rate is undefined when nothing was attempted');
}
assert.equal(summarize([]).processed, 0);
assert.equal(summarize(undefined).processed, 0);

// ------------------------------------------------- missed-run alarm (the point)
{
  const msg = buildDailyReport(user, [], [row('confirmed')], {
    ranYesterday: false,
    extensionVersion: CURRENT_EXTENSION_VERSION
  });
  assert.match(msg.html, /THE DAILY JOB DID NOT RUN/);
  assert.match(msg.text, /ALARM: THE DAILY JOB DID NOT RUN/);
  assert.match(msg.subject, /^NexaShare - Test User - daily report - /, 'subject identifies the user, report type, and date');
  assert.match(msg.html, /#b42318/, 'missed-run header renders red');
  assert.doesNotMatch(msg.html, /still monitoring your configured sources/,
    'must not reassure the reader when nothing actually ran');
}

// A genuinely quiet day must NOT raise the alarm.
{
  const msg = buildDailyReport(user, [], [], {
    ranYesterday: true,
    extensionVersion: CURRENT_EXTENSION_VERSION
  });
  assert.doesNotMatch(msg.html, /THE DAILY JOB DID NOT RUN/);
  assert.doesNotMatch(msg.subject, /ACTION NEEDED/);
  assert.match(msg.html, /still monitoring your configured sources/);
}

// ------------------------------------------------------- stale extension banner
{
  const msg = buildDailyReport(user, [row('confirmed')], [], {
    ranYesterday: true,
    extensionVersion: '1.2.11'
  });
  assert.match(msg.html, /Outdated extension installed/);
  assert.match(msg.html, /v1\.2\.11/);
  assert.match(msg.html, new RegExp(`v${CURRENT_EXTENSION_VERSION.replace(/\./g, '\\.')}`));
}
{
  const msg = buildDailyReport(user, [row('confirmed')], [], {
    ranYesterday: true,
    extensionVersion: CURRENT_EXTENSION_VERSION
  });
  assert.doesNotMatch(msg.html, /Outdated extension installed/);
}
{
  const msg = buildDailyReport(user, [], [], { ranYesterday: true, extensionVersion: null });
  assert.match(msg.html, /No extension has reported in/);
}

// ------------------------------------------------------------- progress table
{
  const today = [row('confirmed'), row('confirmed'), row('failed')];
  const before = [row('confirmed')];
  const msg = buildDailyReport(user, today, before, {
    ranYesterday: true,
    extensionVersion: CURRENT_EXTENSION_VERSION
  });
  assert.match(msg.html, /Yesterday vs the day before/);
  assert.match(msg.html, /Confirmed reposts/);
  assert.match(msg.html, /Confirmation rate/);
  assert.match(msg.html, /\+1/, 'shows the movement, not just the level');
  assert.match(msg.text, /Confirmed reposts: 2 \(was 1\)/);
}
{
  // identical days read as "no change", not a blank cell
  const msg = buildDailyReport(user, [row('confirmed')], [row('confirmed')], {
    ranYesterday: true,
    extensionVersion: CURRENT_EXTENSION_VERSION
  });
  assert.match(msg.html, /no change/);
}

// ------------------------------------------------------------------- escaping
{
  const msg = buildDailyReport(
    { email: 'x@y.z', name: '<script>alert(1)</script>' },
    [row('failed', { company: '<img src=x onerror=1>', detail: 'a & b' })],
    [],
    { ranYesterday: true, extensionVersion: CURRENT_EXTENSION_VERSION }
  );
  assert.doesNotMatch(msg.html, /<script>alert/);
  assert.doesNotMatch(msg.html, /<img src=x/);
  assert.match(msg.html, /a &amp; b/);
}

// ------------------------------------------------------------------- envelope
{
  const msg = buildDailyReport(user, [], [], { ranYesterday: true, extensionVersion: CURRENT_EXTENSION_VERSION });
  assert.equal(msg.to, 'report@gershonconsulting.com', 'individual reports stay internal during review');
  assert.equal(msg.from, 'NexaShare <nexashare@gershon.ai>');
  assert.ok(msg.html && msg.text, 'both bodies are always present');
}

console.log('Daily report checks passed.');
