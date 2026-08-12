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
const healthBody = await health.json();
assert.equal(healthBody.status, 'ready');
assert.equal(healthBody.setup_reminder_email, 'not_configured');

let scheduledPromise;
worker.scheduled({}, env, { waitUntil(promise) { scheduledPromise = promise; } });
assert.deepEqual(await scheduledPromise, [
  { sent: 0, skipped: 'email_not_configured' },
  { sent: 0, skipped: 'email_not_configured' }
]);

let oauthStateValues;
const authStartEnv = {
  ...env,
  DB: {
    prepare(sql) {
      assert.match(sql, /INSERT INTO oauth_states/);
      return {
        bind(...values) {
          oauthStateValues = values;
          return { run: async () => ({ success: true }) };
        }
      };
    }
  }
};
const authStart = await worker.fetch(new Request('https://nexashare.com/api/auth/linkedin?team=ShouldBeIgnored'), authStartEnv);
assert.equal(authStart.status, 302);
assert.match(authStart.headers.get('location'), /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/);
assert.equal(oauthStateValues[1], '');
const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const extensionSource = await readFile(new URL('../chrome-extension/sync-core.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../chrome-extension/popup.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../chrome-extension/manifest.json', import.meta.url), 'utf8'));
const dashboardSource = await readFile(new URL('../public/dashboard.html', import.meta.url), 'utf8');
const onboardingSource = await readFile(new URL('../public/onboarding.html', import.meta.url), 'utf8');
const extensionSetupSource = await readFile(new URL('../public/extension-setup.html', import.meta.url), 'utf8');
const loginSource = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
const registerSource = await readFile(new URL('../public/register.html', import.meta.url), 'utf8');
const reminderMigration = await readFile(new URL('../migrations/0002_setup_reminders.sql', import.meta.url), 'utf8');
const repostLinksMigration = await readFile(new URL('../migrations/0003_repost_links.sql', import.meta.url), 'utf8');
const dailyReportsMigration = await readFile(new URL('../migrations/0004_daily_reports.sql', import.meta.url), 'utf8');
assert.match(workerSource, /openid profile email/);
assert.doesNotMatch(workerSource, /w_member_social|ugcPosts|\/v2\/shares/);
assert.match(workerSource, /UPDATE companies SET enabled/);
assert.match(workerSource, /UPDATE companies SET name/);
assert.match(workerSource, /https:\/\/buy\.stripe\.com\/5kQdRb1rc6mvfcZ8yvcfK00/);
assert.match(workerSource, /enforcement: 'not_configured'/);
assert.match(workerSource, /trial_extended_until_first_confirmed_repost/);
assert.match(workerSource, /status = 'confirmed'/);
assert.match(workerSource, /repost_url/);
assert.match(workerSource, /destination = `\$\{APP_ORIGIN\}\/onboarding\.html`/);
assert.doesNotMatch(workerSource, /searchParams\.get\('team'\)/);
assert.doesNotMatch(workerSource, /\/api\/team\/invite/);
assert.match(workerSource, /INSERT INTO teams \(name\)/);
assert.match(workerSource, /NexaShare is connected/);
assert.match(workerSource, /attempt_count >= 3/);
assert.match(workerSource, /NOT EXISTS \(SELECT 1 FROM companies/);
assert.match(reminderMigration, /UNIQUE\(user_id, reminder_type\)/);
assert.match(extensionSource, /LinkedIn visibly changed the repost control/);
assert.match(extensionSource, /chrome\.alarms/);
assert.match(extensionSource, /periodInMinutes: 1440/);
assert.match(extensionSource, /processedPostIds/);
assert.match(extensionSource, /pendingOutcomes/);
assert.match(extensionSource, /company:name-resolved/);
assert.match(extensionSource, /extractCompanyPageFromDOM/);
assert.match(extensionSource, /findConfirmedRepostUrl/);
assert.match(repostLinksMigration, /ADD COLUMN repost_url/);
assert.match(dailyReportsMigration, /UNIQUE\(user_id, report_date\)/);
assert.match(workerSource, /sendDailyRepostReports/);
assert.match(workerSource, /Only LinkedIn-confirmed reposts are counted as successful/);
assert.equal(manifest.version, '1.2.9');
assert.equal(manifest.icons['128'], 'icons/icon128.png');
assert.equal(manifest.action.default_icon['32'], 'icons/icon32.png');
assert.ok(manifest.permissions.includes('alarms'));
assert.match(dashboardSource, /EXPECTED_EXTENSION_VERSION\s*=\s*'1\.2\.9'/);
assert.match(dashboardSource, /data-view="summary"[\s\S]*?Summary/);
assert.match(dashboardSource, /data-view="companies"[\s\S]*?Companies/);
assert.match(dashboardSource, /data-view="reposts"[\s\S]*?Reposts/);
assert.match(dashboardSource, /data-view="log"[\s\S]*?Extension Log/);
assert.match(dashboardSource, /nexashare-ext-get-log/);
assert.match(dashboardSource, /Chrome Extension Log/);
assert.match(dashboardSource, /Open original post/);
assert.match(dashboardSource, /Your repost/);
assert.match(dashboardSource, /Company post/);
assert.match(dashboardSource, /Post text/);
assert.match(dashboardSource, /r\.post_text/);
assert.match(dashboardSource, /Run test now/);
assert.match(dashboardSource, /runRepostCheck/);
assert.match(dashboardSource, /id="extensionUpdateBanner"/);
assert.match(dashboardSource, /EXPECTED_EXTENSION_VERSION\s*=\s*'1\.2\.9'/);
assert.match(dashboardSource, /Reload instructions/);
assert.match(dashboardSource, /extension is not connected/);
assert.match(dashboardSource, /extension-setup\.html/);
assert.match(dashboardSource, /Free access extended/);
assert.match(dashboardSource, /id="addCompanyButton"/);
assert.match(dashboardSource, /Checking and adding this company/);
assert.match(extensionSetupSource, /Load unpacked/);
assert.match(extensionSetupSource, /Current version 1\.2\.9/);
assert.match(extensionSetupSource, /nexashare-extension-1\.2\.9\.zip/);
assert.match(dashboardSource, /autoConnectExtension/);
assert.match(dashboardSource, /No connection button is required/);
assert.doesNotMatch(popupSource, /Connect this extension from the NexaShare dashboard first/);
assert.match(extensionSource, /\[role="button"\]/);
assert.match(extensionSource, /Repost instantly/);
assert.match(extensionSource, /view repost\|view reshare/);
assert.match(extensionSource, /repostUrl/);
assert.doesNotMatch(extensionSource, /LinkedIn did not show a direct repost action/);
assert.match(extensionSource, /ensureLinkedInSession/);
assert.match(extensionSource, /inMenu/);
assert.match(extensionSource, /visible repost confirmation/);
assert.match(onboardingSource, /Which company should NexaShare follow\?/);
assert.match(onboardingSource, /Partners or clients to follow/);
assert.match(onboardingSource, /one LinkedIn company-page link per line/);
assert.match(onboardingSource, /\/api\/companies/);
assert.match(onboardingSource, /LinkedIn visibly confirms it/);
assert.match(loginSource, /Connect with LinkedIn/);
assert.doesNotMatch(loginSource, /Create a team|Company \/ Team name|register\.html/);
assert.match(registerSource, /location\.replace\('\/login\.html'\)/);
assert.doesNotMatch(registerSource, /Create your team|teamName/);

console.log('Worker and extension smoke checks passed.');

