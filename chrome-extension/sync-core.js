const API_BASE = 'https://nexashare.com';
const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_DELAY_MS = 2000;
const REPOST_DELAY_MS = 3000;
const SOURCE_DELAY_MS = 5000;
const PAGE_LOAD_MS = 6000;
const POST_DISCOVERY_ATTEMPTS = 16;
const MAX_LOG_ENTRIES = 200;
const DAILY_ALARM = 'dailyRepost';
const RETRY_ALARM = 'retryRepost';
const RETRY_DELAYS_MINUTES = [5, 20, 60];
const SOURCE_DISCOVERY_ATTEMPTS = 3;
const REPOST_ATTEMPTS = 4;
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
let activeSyncPromise = null;

async function log(level, message, data) {
  const entry = { ts: new Date().toISOString(), level, msg: message, data: data === undefined ? null : data };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[NexaShare]', message, data || '');
  const stored = await chrome.storage.local.get('nexashareLog');
  await chrome.storage.local.set({ nexashareLog: [entry, ...(stored.nexashareLog || [])].slice(0, MAX_LOG_ENTRIES) });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm();
  chrome.action.setBadgeBackgroundColor({ color: '#0A66C2' });
  log('info', 'Extension installed; automatic daily check enabled');
});

chrome.runtime.onStartup.addListener(ensureDailyAlarm);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === DAILY_ALARM || alarm.name === RETRY_ALARM) {
    const trigger = alarm.name === RETRY_ALARM ? 'automatic-retry' : 'scheduled';
    runFullSync({ trigger }).catch(error => log('error', 'scheduled-run:failed', { error: String(error), trigger }));
  }
});

async function ensureDailyAlarm() {
  const existing = await chrome.alarms.get(DAILY_ALARM);
  if (!existing) chrome.alarms.create(DAILY_ALARM, { delayInMinutes: 15, periodInMinutes: 1440 });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'syncNow') {
    runFullSync({ trigger: 'manual' }).then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.action === 'getLog') {
    chrome.storage.local.get('nexashareLog', data => sendResponse({ ok: true, log: data.nexashareLog || [] }));
    return true;
  }
  if (message.action === 'clearLog') {
    chrome.storage.local.set({ nexashareLog: [] }, () => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'getStatus') {
    chrome.storage.local.get(['lastSyncResult', 'companies', 'apiToken'], data => sendResponse({
      ok: true,
      connected: !!data.apiToken,
      lastSync: data.lastSyncResult || null,
      companies: data.companies || []
    }));
    return true;
  }
  if (message.action === 'setCompanies') {
    sendResponse({ ok: false, error: 'Add companies in the NexaShare dashboard.' });
    return true;
  }
  if (message.action === 'configure') {
    if (!message.apiToken || message.apiBase !== API_BASE) {
      sendResponse({ ok: false, error: 'Invalid NexaShare configuration.' });
    } else {
      chrome.storage.local.set({ apiToken: message.apiToken, apiBase: API_BASE }, () => sendResponse({ ok: true }));
    }
    return true;
  }
  if (message.action === 'salesNavStatus') {
    hasLinkedInSession().then(ok => sendResponse({ ok }));
    return true;
  }
});

async function authenticatedFetch(path, options = {}) {
  const stored = await chrome.storage.local.get(['apiToken', 'apiBase']);
  if (!stored.apiToken || stored.apiBase !== API_BASE) throw new Error('Connect the extension from the NexaShare dashboard first.');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${stored.apiToken}` }
  });
  if (!response.ok) throw new Error(`NexaShare API returned HTTP ${response.status}. Reconnect the extension from the dashboard.`);
  return response.json();
}

function runFullSync(options = {}) {
  if (activeSyncPromise) {
    log('warn', 'run:already-active', { requestedTrigger: options.trigger || 'manual' });
    return activeSyncPromise;
  }
  activeSyncPromise = runFullSyncUnlocked(options).finally(() => { activeSyncPromise = null; });
  return activeSyncPromise;
}

async function runFullSyncUnlocked({ trigger = 'manual' } = {}) {
  await chrome.storage.local.set({ nexashareLog: [] });
  await log('info', 'run:start', { trigger });
  setBadge('â€¦', '#6b7280');

  let companies;
  try {
    const [companyData, peopleData] = await Promise.all([
      authenticatedFetch('/api/companies'),
      authenticatedFetch('/api/people')
    ]);
    companies = [
      ...(companyData.companies || []).map(item => ({ ...item, sourceType: 'company' })),
      ...(peopleData.people || []).map(item => ({ ...item, sourceType: 'person' }))
    ];
    await chrome.storage.local.set({ companies });
  } catch (error) {
    await log('error', 'configuration:failed', { error: String(error) });
    setBadge('!', '#dc2626');
    return { status: 'not-connected', error: String(error) };
  }

  if (!companies.length) {
    await log('warn', 'No companies configured. Add one in the NexaShare dashboard.');
    setBadge('!', '#f59e0b');
    return { status: 'no-companies' };
  }

  if (!(await ensureLinkedInSession())) {
    await log('warn', 'LinkedIn sign-in is required. NexaShare opened LinkedIn automatically, but no signed-in session was detected.', { trigger });
    setBadge('!', '#dc2626');
    const waiting = { status: 'not-logged-in', trigger, ts: new Date().toISOString() };
    await chrome.storage.local.set({ lastSyncResult: waiting });
    return waiting;
  }

  const pendingStore = await chrome.storage.local.get('pendingOutcomes');
  const outcomes = [...(pendingStore.pendingOutcomes || [])];
  const priorPendingCount = outcomes.length;
  let totalScraped = 0;
  const dedupeStore = await chrome.storage.local.get('processedPostIds');
  const processedPostIds = dedupeStore.processedPostIds || {};
  const enabledCompanies = companies.filter(item => item.enabled !== 0);
  let discoveryFailures = 0;
  let discoveryFailureReason = '';
  if (!enabledCompanies.length) {
    for (const company of companies) outcomes.push(makeCompanyOutcome(company, 'skipped', 'Automatic reposting is paused for this company.'));
  }
  for (const company of enabledCompanies) {
    try {
      const scraped = await scrapeCompanyPosts(company);
      const posts = scraped.posts;
      if (scraped.notReady) {
        discoveryFailures += 1;
        discoveryFailureReason = scraped.reason || 'linkedin_layout_unrecognized';
        await log('warn', 'linkedin-layout:fingerprint', {
          company: company.name,
          reason: discoveryFailureReason,
          fingerprint: scraped.layoutFingerprint || 'unknown',
          detectors: scraped.detectors || []
        });
      }
      if (scraped.companyName && scraped.companyName !== company.name) {
        await authenticatedFetch(`/api/${company.sourceType === 'person' ? 'people' : 'companies'}/${company.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: scraped.companyName })
        });
        company.name = scraped.companyName;
        await chrome.storage.local.set({ companies });
        await log('info', 'company:name-resolved', { companyId: company.id, name: company.name });
      }
      totalScraped += posts.length;
      await log('info', 'company:scraped', { company: company.name, posts: posts.length });
      const sourceKey = `${company.sourceType || 'company'}:${company.id}`;
      const seen = new Set(processedPostIds[sourceKey] || []);
      let candidateHandled = false;
      for (const post of posts) {
        if (!post.url || seen.has(post.id)) continue;
        if (post.alreadyReposted) {
          outcomes.push(makeOutcome(company, post, 'already_reposted', 'LinkedIn already showed this post as reposted.'));
          rememberPost(seen, post.id);
          continue;
        }
        candidateHandled = true;
        try {
          await authenticatedFetch('/api/extension/deliveries/processing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postUrl: post.url })
          });
          const result = await repostContent(post);
          outcomes.push(makeOutcome(company, post, result.confirmed ? 'confirmed' : 'failed', result.detail, result.repostUrl));
          if (result.confirmed) rememberPost(seen, post.id);
        } catch (error) {
          outcomes.push(makeOutcome(company, post, 'failed', String(error)));
        }
        await sleep(REPOST_DELAY_MS + Math.random() * 2000);
        break;
      }
      if (!candidateHandled && !posts.some(post => post.alreadyReposted && !seen.has(post.id))) {
        outcomes.push(makeCompanyOutcome(company, scraped.notReady ? 'failed' : 'skipped', posts.length ? 'No new eligible posts were found.' : (scraped.notReady ? discoveryFailureDetail(scraped.reason) : 'No posts were found on the company page.')));
      }
      processedPostIds[sourceKey] = [...seen].slice(-500);
      // A single LinkedIn layout problem must never abort the remaining sources.
      // Preserve the failure for retry/telemetry and continue the batch.
    } catch (error) {
      await log('error', 'company:failed', { company: company.name, error: String(error) });
      outcomes.push(makeCompanyOutcome(company, 'failed', String(error)));
    }
    await sleep(SOURCE_DELAY_MS + Math.random() * 5000);
  }
  if (discoveryFailures > 0) await scheduleAutomaticRetry(trigger, discoveryFailureReason);
  else await resetAutomaticRetry();
  await chrome.storage.local.set({ processedPostIds });

  let reported = false;
  try {
    if (outcomes.length) {
      await authenticatedFetch('/api/extension/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcomes, trigger, extensionVersion: EXTENSION_VERSION })
      });
    }
    reported = true;
    await chrome.storage.local.set({ pendingOutcomes: [] });
  } catch (error) {
    await log('error', 'reporting:failed', { error: String(error) });
    await chrome.storage.local.set({ pendingOutcomes: outcomes.slice(-200) });
  }

  const result = {
    status: !reported ? 'reporting-failed' : (!enabledCompanies.length ? 'paused' : 'complete'),
    trigger,
    ts: new Date().toISOString(),
    companies: companies.length,
    totalScraped,
    totalConfirmed: outcomes.filter(item => item.status === 'confirmed').length,
    totalFailed: outcomes.filter(item => item.status === 'failed').length,
    totalAlreadyReposted: outcomes.filter(item => item.status === 'already_reposted').length,
    retriedOutcomes: priorPendingCount,
    circuitOpened: false,
    discoveryFailures,
    discoveryFailureReason
  };
  await chrome.storage.local.set({ lastSyncResult: result });
  await log('info', 'run:done', result);
  setBadge(result.totalFailed || !reported ? '!' : 'âœ“', result.totalFailed || !reported ? '#dc2626' : '#059669');
  return result;
}

async function hasLinkedInSession() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  for (const tab of tabs) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!document.querySelector('#global-nav, .global-nav__me, a[href*="/in/"]')
      });
      if (results?.[0]?.result) return true;
    } catch (error) {}
  }
  return false;
}

async function ensureLinkedInSession() {
  if (await hasLinkedInSession()) return true;
  return withBackgroundTab('https://www.linkedin.com/feed/', async tabId => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector('#global-nav, .global-nav__me, a[href*="/in/"]') && !/\/login|\/checkpoint/.test(location.pathname)
    });
    return !!results?.[0]?.result;
  });
}

function sourceUrl(source) {
  return source.sourceType === 'person'
    ? `https://www.linkedin.com/in/${source.vanity}/recent-activity/all/`
    : `https://www.linkedin.com/company/${source.vanity}/posts/?feedView=all&viewAsMember=true`;
}

function discoveryFailureDetail(reason) {
  const details = {
    linkedin_login_required: 'LinkedIn signed the browser out while NexaShare was running. Sign in again; the remaining sources were preserved.',
    linkedin_checkpoint: 'LinkedIn displayed a security checkpoint. Complete it in LinkedIn; the remaining sources were preserved.',
    linkedin_rate_limited: 'LinkedIn temporarily limited page loading. NexaShare stopped the batch and scheduled a controlled retry.',
    linkedin_admin_redirect: 'LinkedIn redirected the company feed to its admin dashboard. NexaShare will retry using member view.',
    linkedin_empty_feed: 'LinkedIn loaded the source page but did not expose any posts.',
    linkedin_tab_closed: 'The LinkedIn tab closed before NexaShare finished. NexaShare scheduled a controlled retry.',
    linkedin_layout_unrecognized: 'LinkedIn loaded, but its post-card layout was not recognized. NexaShare stopped the batch to avoid repeated failures and scheduled a controlled retry.'
  };
  return details[reason] || details.linkedin_layout_unrecognized;
}

async function scheduleAutomaticRetry(trigger, reason) {
  const stored = await chrome.storage.local.get('automaticRetryCount');
  const previous = trigger === 'manual' ? 0 : Number(stored.automaticRetryCount || 0);
  const retryIndex = Math.min(previous, RETRY_DELAYS_MINUTES.length - 1);
  if (previous >= RETRY_DELAYS_MINUTES.length) {
    await log('error', 'automatic-retry:exhausted', { reason, attempts: previous });
    return;
  }
  const delayInMinutes = RETRY_DELAYS_MINUTES[retryIndex];
  await chrome.storage.local.set({ automaticRetryCount: previous + 1 });
  chrome.alarms.create(RETRY_ALARM, { delayInMinutes });
  await log('warn', 'automatic-retry:scheduled', { reason, attempt: previous + 1, delayInMinutes });
}

async function resetAutomaticRetry() {
  await chrome.storage.local.set({ automaticRetryCount: 0 });
  await chrome.alarms.clear(RETRY_ALARM);
}

async function scrapeCompanyPosts(source) {
  let lastResult = null;
  for (let attempt = 1; attempt <= SOURCE_DISCOVERY_ATTEMPTS; attempt++) {
    lastResult = await scrapeCompanyPostsOnce(source, attempt);
    if (!lastResult.notReady) return lastResult;
    await log('warn', 'company:load-retry', {
      company: source.name,
      attempt,
      reason: lastResult.reason,
      fingerprint: lastResult.layoutFingerprint || 'unknown',
      detectors: lastResult.detectors || []
    });
    if (attempt < SOURCE_DISCOVERY_ATTEMPTS) await sleep(1200 * attempt);
  }
  return lastResult || {
    companyName: '',
    posts: [],
    notReady: true,
    reason: 'linkedin_layout_unrecognized',
    layoutFingerprint: 'unknown',
    detectors: []
  };
}

async function scrapeCompanyPostsOnce(source, recoveryAttempt = 1) {
  const url = sourceUrl(source);
  return withBackgroundTab(url, async tabId => {
    const readiness = await waitForLinkedInPosts(tabId);
    if (!readiness.ready) {
      return {
        companyName: '',
        posts: [],
        notReady: true,
        reason: readiness.reason,
        layoutFingerprint: readiness.layoutFingerprint || 'unknown',
        detectors: readiness.detectors || []
      };
    }

    const scrolls = MAX_SCROLL_ATTEMPTS + Math.min(recoveryAttempt - 1, 2);
    for (let index = 0; index < scrolls; index++) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.focus();
          window.scrollBy(0, Math.max(900, Math.floor(window.innerHeight * 1.25)));
        }
      });
      await sleep(index < 2 ? 900 : SCROLL_DELAY_MS);
    }

    const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractCompanyPageFromDOM });
    const extracted = results?.[0]?.result || { companyName: '', posts: [], detectors: [] };
    if (!extracted.posts?.length && readiness.ready) {
      return {
        ...extracted,
        notReady: true,
        reason: 'linkedin_layout_unrecognized',
        layoutFingerprint: readiness.layoutFingerprint || extracted.layoutFingerprint || 'unknown'
      };
    }
    return extracted;
  });
}

async function waitForLinkedInPosts(tabId) {
  for (let attempt = 0; attempt < POST_DISCOVERY_ATTEMPTS; attempt++) {
    let results;
    try {
      results = await chrome.scripting.executeScript({ target: { tabId }, func: inspectLinkedInPage });
    } catch (error) {
      if (/No tab with id/i.test(String(error))) return { ready: false, reason: 'linkedin_tab_closed' };
      throw error;
    }
    const state = results?.[0]?.result;
    if (state?.ready) return state;
    if (state?.terminal) return state;
    if (attempt === 4 || attempt === 9) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            window.focus();
            window.scrollBy(0, Math.max(600, window.innerHeight));
          }
        });
      } catch (error) {}
    }
    await sleep(900 + Math.min(attempt, 5) * 120);
  }
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: inspectLinkedInPage, args: [true] });
    return results?.[0]?.result || { ready: false, reason: 'linkedin_layout_unrecognized' };
  } catch (error) {
    return { ready: false, reason: /No tab with id/i.test(String(error)) ? 'linkedin_tab_closed' : 'linkedin_layout_unrecognized' };
  }
}

function inspectLinkedInPage(finalAttempt = false) {
  const path = location.pathname.toLowerCase();
  const pageText = (document.body?.innerText || '').slice(0, 12000).toLowerCase();
  const hash = value => {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  };
  const fingerprintSource = [...document.querySelectorAll('main article, main [data-urn], main [data-view-name], main button, main [role="button"]')]
    .slice(0, 80)
    .map(node => [
      node.tagName,
      (node.className && typeof node.className === 'string' ? node.className : '').split(/\s+/).slice(0, 3).join('.'),
      node.getAttribute('data-view-name') || '',
      node.getAttribute('role') || '',
      node.hasAttribute('data-urn') ? 'urn' : ''
    ].join(':'))
    .join('|');
  const layoutFingerprint = 'li-' + hash(path + '|' + fingerprintSource);

  if (/\/login|\/uas\/login/.test(path)) return { ready: false, terminal: true, reason: 'linkedin_login_required', layoutFingerprint };
  if (/\/checkpoint|\/challenge/.test(path)) return { ready: false, terminal: true, reason: 'linkedin_checkpoint', layoutFingerprint };
  if (/\/admin\/dashboard/.test(path)) return { ready: false, terminal: true, reason: 'linkedin_admin_redirect', layoutFingerprint };
  if (/too many requests|temporarily restricted|try again later|réessayez plus tard|versuche es später erneut/.test(pageText)) {
    return { ready: false, terminal: true, reason: 'linkedin_rate_limited', layoutFingerprint };
  }

  const detectors = [];
  const structuralCards = document.querySelectorAll([
    '.feed-shared-update-v2',
    '.occludable-update',
    '[data-urn*="activity"]',
    '[data-id*="urn:li:activity"]',
    '[data-entity-urn*="activity"]',
    '[data-view-name="feed-full-update"]',
    'article[data-urn]',
    'main article'
  ].join(','));
  if (structuralCards.length) detectors.push('structural-card');

  const activityLinks = document.querySelectorAll('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
  if (activityLinks.length) detectors.push('activity-link');

  const semanticControls = document.querySelectorAll(
    '[data-view-name*="repost"], [data-view-name*="reshare"], button[aria-pressed], .social-actions-button, .social-reshare-button'
  );
  if (semanticControls.length) detectors.push('semantic-control');

  const controls = [...document.querySelectorAll('button, [role="button"]')];
  const repostPattern = /repost|reshare|republier|republication|reposter|reposten|teilen|erneut teilen|volver a publicar|compartir de nuevo|ripubblica|ricondividi/i;
  if (controls.some(control => repostPattern.test((control.getAttribute('aria-label') || '') + ' ' + (control.textContent || '')))) {
    detectors.push('localized-text-fallback');
  }

  if (detectors.length) return { ready: true, reason: '', layoutFingerprint, detectors };
  const signedIn = !!document.querySelector('#global-nav, .global-nav__me, a[href*="/in/"]');
  if (!finalAttempt) return { ready: false, reason: '', layoutFingerprint, detectors };
  if (!signedIn) return { ready: false, reason: 'linkedin_login_required', layoutFingerprint, detectors };
  if (/no posts|aucune publication|keine beiträge|sin publicaciones/i.test(pageText)) {
    return { ready: false, reason: 'linkedin_empty_feed', layoutFingerprint, detectors };
  }
  return { ready: false, reason: 'linkedin_layout_unrecognized', layoutFingerprint, detectors };
}

function extractCompanyPageFromDOM() {
  const byId = new Map();
  const detectors = new Set();
  const candidateCards = new Set();
  const cardSelectors = [
    '.feed-shared-update-v2',
    '.occludable-update',
    '[data-urn*="activity"]',
    '[data-id*="urn:li:activity"]',
    '[data-entity-urn*="activity"]',
    '[data-view-name="feed-full-update"]',
    'article[data-urn]',
    'main article'
  ];

  document.querySelectorAll(cardSelectors.join(',')).forEach(node => candidateCards.add(node));
  if (candidateCards.size) detectors.add('structural-card');

  document.querySelectorAll('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]').forEach(link => {
    const card = link.closest(cardSelectors.join(',')) || link.closest('article') || link.parentElement;
    if (card) candidateCards.add(card);
  });
  if (document.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]')) detectors.add('activity-link');

  const activityIdFrom = item => {
    const evidence = [
      item.getAttribute?.('data-urn') || '',
      item.getAttribute?.('data-id') || '',
      item.getAttribute?.('data-entity-urn') || '',
      ...[...(item.querySelectorAll?.('a[href]') || [])].slice(0, 20).map(link => link.href || '')
    ].join(' ');
    return evidence.match(/(?:urn:li:activity:|activity(?::|-))(\d{6,})/i)?.[1] || '';
  };

  const controlFor = item => {
    const semantic = item.querySelector(
      '[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button, button[aria-pressed]'
    );
    if (semantic) {
      detectors.add('semantic-control');
      return semantic;
    }
    const localized = [...item.querySelectorAll('button, [role="button"]')].find(candidate => {
      const value = ((candidate.getAttribute('aria-label') || '') + ' ' + (candidate.getAttribute('data-view-name') || '') + ' ' + (candidate.textContent || '')).toLowerCase();
      return /repost|reshare|republier|republication|reposter|reposten|teilen|erneut teilen|volver a publicar|ripubblica|ricondividi/.test(value);
    });
    if (localized) detectors.add('localized-text-fallback');
    return localized || null;
  };

  for (const item of candidateCards) {
    const id = activityIdFrom(item);
    if (!id || byId.has(id)) continue;
    const textNode = item.querySelector(
      '.feed-shared-text, .update-components-text, [data-test-id="main-feed-activity-card__commentary"], [data-view-name="feed-commentary"], [dir="ltr"]'
    );
    const text = (textNode?.textContent || item.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const button = controlFor(item);
    const controlText = (button?.getAttribute?.('aria-label') || '') + ' ' + (button?.textContent || '');
    byId.set(id, {
      id,
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:' + id + '/',
      text,
      alreadyReposted: !!button && (
        button.getAttribute('aria-pressed') === 'true' ||
        button.classList.contains('react-button--active') ||
        /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen/i.test(controlText)
      )
    });
  }

  if (!byId.size) {
    const stripPostHeader = value => {
      const head = value.slice(0, 140);
      const marker = head.indexOf('•');
      return (marker === -1 ? value : value.slice(marker + 1)).replace(/^[\s·]+/, '').trim();
    };
    const hashText = value => {
      let h = 5381;
      for (let i = 0; i < value.length; i++) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
      return 't' + h.toString(36);
    };
    const semanticControls = [...document.querySelectorAll(
      '[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button, button[aria-pressed], button, [role="button"]'
    )].filter(node => {
      if (node.matches('[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button')) return true;
      const value = (node.getAttribute('aria-label') || '') + ' ' + (node.textContent || '');
      return /repost|reshare|republier|republication|reposter|reposten|teilen|erneut teilen|volver a publicar|ripubblica|ricondividi/i.test(value);
    });

    for (const control of semanticControls) {
      let node = control;
      let card = null;
      for (let depth = 0; depth < 14 && node; depth++) {
        node = node.parentElement;
        if (!node) break;
        const textLength = (node.innerText || '').replace(/\s+/g, ' ').trim().length;
        if (textLength >= 40 && textLength <= 12000) card = node;
        if (node.tagName === 'ARTICLE' || node.hasAttribute('data-urn')) break;
      }
      if (!card) continue;
      const cardText = (card.innerText || '').replace(/\s+/g, ' ').replace(/^Feed post\s*/i, '').trim();
      const bodyText = stripPostHeader(cardText);
      if (!bodyText) continue;
      const matchText = bodyText.slice(0, 240);
      const id = hashText(matchText);
      if (byId.has(id)) continue;
      detectors.add('text-hash-fallback');
      byId.set(id, {
        id,
        url: location.href.split('#')[0],
        inPlace: true,
        matchText,
        text: bodyText.slice(0, 1200),
        alreadyReposted: control.getAttribute('aria-pressed') === 'true' ||
          /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen/i.test(control.getAttribute('aria-label') || '')
      });
    }
  }

  const heading = document.querySelector('h1.org-top-card-summary__title, h1.org-top-card-summary-info-list__info-item, main h1');
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const rawName = heading?.textContent?.trim() || metaTitle.replace(/\s*[|\-]\s*LinkedIn.*$/i, '').trim();
  const companyName = rawName && !/^\d+$/.test(rawName) && !/^linkedin$/i.test(rawName) ? rawName.slice(0, 100) : '';
  return { companyName, posts: [...byId.values()], detectors: [...detectors] };
}

async function repostContent(post) {
  await log('info', 'repost:attempt', { postId: post.id, url: post.url, inPlace: !!post.inPlace });
  if (post.inPlace) return repostOnSourcePage(post);

  let result;
  for (let attempt = 1; attempt <= REPOST_ATTEMPTS; attempt++) {
    result = await withBackgroundTab(post.url, async tabId => {
      const readiness = await waitForLinkedInPosts(tabId);
      if (!readiness.ready) {
        return {
          confirmed: false,
          retryable: true,
          detail: discoveryFailureDetail(readiness.reason) + ' Layout ' + (readiness.layoutFingerprint || 'unknown') + '.'
        };
      }

      if (attempt > 1) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            window.focus();
            window.scrollTo({ top: Math.max(0, document.body.scrollHeight * 0.2), behavior: 'instant' });
          }
        });
        await sleep(700 * attempt);
      }

      const results = await chrome.scripting.executeScript({ target: { tabId }, func: clickAndConfirmRepost });
      return results?.[0]?.result || { confirmed: false, retryable: true, detail: 'LinkedIn did not return an outcome.' };
    });

    if (result.confirmed || !result.retryable) break;
    await log('warn', 'repost:progressive-retry', { postId: post.id, attempt, detail: result.detail });
    if (attempt < REPOST_ATTEMPTS) await sleep(1000 * attempt);
  }

  result ||= { confirmed: false, detail: 'LinkedIn did not return an outcome after progressive recovery.' };
  if (result.confirmed && !result.repostUrl) {
    result.detail += ' LinkedIn confirmed the repost, but did not expose a View repost link to record.';
  }
  await log(result.confirmed ? 'info' : 'warn', result.confirmed ? 'repost:confirmed' : 'repost:not-confirmed', {
    postId: post.id,
    detail: result.detail
  });
  return result;
}

async function repostOnSourcePage(post) {
  return withBackgroundTab(post.url, async tabId => {
    await waitForLinkedInPosts(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: clickAndConfirmRepostInPlace,
      args: [post.matchText || '']
    });
    const result = results?.[0]?.result || { confirmed: false, detail: 'LinkedIn did not return an outcome.' };
    await log(result.confirmed ? 'info' : 'warn', result.confirmed ? 'repost:confirmed' : 'repost:not-confirmed', { postId: post.id, detail: result.detail });
    return result;
  });
}

async function findConfirmedRepostUrl(originalPostId) {
  if (!originalPostId) return '';
  return withBackgroundTab('https://www.linkedin.com/in/me/recent-activity/reposts/', async tabId => {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollBy(0, 800) });
    await sleep(SCROLL_DELAY_MS);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: findRepostActivityInDOM,
      args: [String(originalPostId)]
    });
    return results?.[0]?.result || '';
  });
}

function findRepostActivityInDOM(originalPostId) {
  const cards = document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"], .occludable-update');
  for (const card of cards) {
    const evidence = `${card.getAttribute('data-urn') || ''} ${card.innerHTML}`;
    if (!evidence.includes(originalPostId)) continue;
    const activityMatch = (card.getAttribute('data-urn') || '').match(/activity:(\d+)/);
    if (activityMatch && activityMatch[1] !== originalPostId) {
      return `https://www.linkedin.com/feed/update/urn:li:activity:${activityMatch[1]}/`;
    }
  }
  return '';
}

async function clickAndConfirmRepost() {
  const isVisible = item => {
    const box = item?.getBoundingClientRect?.();
    return !!box && box.width > 0 && box.height > 0 && getComputedStyle(item).visibility !== 'hidden' && getComputedStyle(item).display !== 'none';
  };
  const describe = item => `${item?.getAttribute?.('aria-label') || ''} ${item?.getAttribute?.('data-view-name') || ''} ${item?.textContent || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
  const isRepostControl = value => /\brepost\b|\breshare\b|republier|republication|reposten/.test(value);
  const isCommentShare = value => /with your thoughts|quote|ajouter (?:vos|mes) réflexions|avec (?:vos|mes) réflexions|avec un commentaire|gedanken hinzufügen|mit (?:ihren|deinen|eigenen) gedanken|mit kommentar/.test(value);
  const isUndoRepost = value => /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen/.test(value);
  const isInstantRepost = value => /^(?:repost|reshare) instantly\b/.test(value)
    || /^(?:repost|reshare)\b[^]*\binstantly\b/.test(value)
    || /^republier (?:instantanément|maintenant)\b/.test(value)
    || /^republier\b[^]*instantan/.test(value)
    || /^(?:jetzt|sofort|direkt) reposten\b/.test(value)
    || /^reposten\b/.test(value);
  // LinkedIn labels some controls with BOTH aria-label and identical inner text, so the
  // concatenated describe() reads "repost repost" and anchored predicates never match.
  const labelsOf = item => [item?.getAttribute?.('aria-label') || '', item?.getAttribute?.('data-view-name') || '', item?.textContent || '']
    .map(value => value.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .concat(describe(item));
  const labelled = (item, predicate) => labelsOf(item).some(predicate);
  const isSuccessNotice = value => /repost successful|reposted|post shared|shared successfully|republication réussie|publication republiée|a été republié|erfolgreich repostet|beitrag (?:wurde )?repostet|repost erfolgreich/.test(value) && !/could not|error|failed|impossible|erreur|échec|fehlgeschlagen|fehler/.test(value);
  const isViewRepost = value => /view repost|view reshare|voir la republication|republication anzeigen|repost anzeigen/.test(value);
  const controls = () => [...document.querySelectorAll('button, [role="button"], [data-view-name*="repost"], [data-view-name*="reshare"]')].filter(isVisible);
  const button = controls().find(item => {
    const value = describe(item);
    return isRepostControl(value) && !isCommentShare(value);
  });
  if (!button) return { confirmed: false, retryable: true, detail: 'Repost button was not found in the visible LinkedIn post.' };
  if (button.getAttribute('aria-pressed') === 'true' || isUndoRepost(describe(button))) return { confirmed: false, detail: 'Post was already reposted.' };
  const before = describe(button);
  button.scrollIntoView({ block: 'center', inline: 'center' });
  button.click();

  let action;
  for (let attempt = 0; attempt < 10 && !action; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 300));
    action = [...document.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"], .artdeco-dropdown__item, .social-reshare-button')]
      .filter(isVisible)
      .find(item => {
        // LinkedIn's current popup uses role=button elements inside generic
        // containers, not its former role=menu/artdeco markup.  Match the visible
        // direct-share action; never choose the thoughts/quote path.
        return labelled(item, isInstantRepost) && !labelled(item, isCommentShare);
      });
  }
  if (!action) return { confirmed: false, detail: "NexaShare opened the repost menu but could not identify LinkedIn's visible Repost instantly choice." };
  action.scrollIntoView({ block: 'center', inline: 'center' });
  action.click();

  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const current = controls().find(item => item === button || isRepostControl(describe(item)));
    const controlChanged = current && (current.getAttribute('aria-pressed') === 'true' || current.classList.contains('react-button--active') || isUndoRepost(describe(current)) || (current === button && describe(current) !== before));
    const notices = [...document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item, .artdeco-inline-feedback')].filter(isVisible);
    const successNotice = notices.find(item => isSuccessNotice(describe(item)));
    const viewRepost = successNotice && [...successNotice.querySelectorAll('a[href]')].find(link => isViewRepost(describe(link)));
    const repostUrl = viewRepost ? new URL(viewRepost.getAttribute('href'), location.origin).href : '';
    if (successNotice) return { confirmed: true, repostUrl, detail: repostUrl ? 'LinkedIn confirmed the repost and provided its View repost link.' : 'LinkedIn displayed a visible repost confirmation.' };
    if (controlChanged) return { confirmed: true, detail: 'LinkedIn visibly changed the repost control to its active state.' };
  }
  return { confirmed: false, detail: 'NexaShare selected LinkedIn\'s direct Repost choice, but LinkedIn did not provide visible confirmation.' };
}

async function clickAndConfirmRepostInPlace(matchText) {
  const isVisible = item => {
    const box = item?.getBoundingClientRect?.();
    return !!box && box.width > 0 && box.height > 0 && getComputedStyle(item).visibility !== 'hidden' && getComputedStyle(item).display !== 'none';
  };
  const describe = item => `${item?.getAttribute?.('aria-label') || ''} ${item?.getAttribute?.('data-view-name') || ''} ${item?.textContent || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
  const labelsOf = item => [item?.getAttribute?.('aria-label') || '', item?.getAttribute?.('data-view-name') || '', item?.textContent || '']
    .map(value => value.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .concat(describe(item));
  const labelled = (item, predicate) => labelsOf(item).some(predicate);
  const isCommentShare = value => /with (?:your|my) thoughts|with thoughts|quote|ajouter (?:vos|mes) réflexions|avec (?:vos|mes) réflexions|avec un commentaire|gedanken hinzufügen|mit kommentar/.test(value);
  const isInstantRepost = value => /^(?:repost|reshare) instantly\b/.test(value)
    || /^(?:repost|reshare)\b[^]*\binstantly\b/.test(value)
    || /^republier (?:instantanément|maintenant)\b/.test(value)
    || /^republier\b[^]*instantan/.test(value)
    || /^(?:jetzt|sofort|direkt) reposten\b/.test(value)
    || /^reposten\b/.test(value);
  const isUndoRepost = value => /undo repost|remove repost|annuler la republication|supprimer la republication/.test(value);
  const isSuccessNotice = value => /repost successful|reposted|post shared|shared successfully|républication réussie|republication réussie|publication republiée|a été republié/.test(value) && !/could not|error|failed|impossible|erreur|échec/.test(value);
  const isViewRepost = value => /view repost|view reshare|voir la republication/.test(value);
  const isRepostControl = item => /^(?:repost|republier|reposten)$/i.test((item.getAttribute('aria-label') || '').trim());

  const wanted = String(matchText || '').replace(/\s+/g, ' ').trim().slice(0, 240).toLowerCase();
  const anchors = [...document.querySelectorAll('[aria-label]')]
    .filter(node => /^Open control menu for post by /i.test(node.getAttribute('aria-label') || ''));
  let card = null;
  for (const anchor of anchors) {
    let node = anchor;
    let candidate = null;
    for (let depth = 0; depth < 12 && node; depth++) {
      node = node.parentElement;
      if (node && [...node.querySelectorAll('button, [role="button"]')].some(isRepostControl)) { candidate = node; break; }
    }
    if (!candidate) continue;
    const raw = (candidate.innerText || '').replace(/\s+/g, ' ').replace(/^Feed post\s*/i, '').trim();
    const head = raw.slice(0, 140);
    const marker = head.indexOf('\u2022');
    const text = (marker === -1 ? raw : raw.slice(marker + 1)).replace(/^[\s\u00b7]+/, '').trim().toLowerCase();
    if (!wanted || text.slice(0, 240) === wanted || text.includes(wanted.slice(0, 120))) { card = candidate; break; }
  }
  if (!card) return { confirmed: false, detail: 'NexaShare could not find this post again on the LinkedIn page; it may have moved or been removed.' };

  const button = [...card.querySelectorAll('button, [role="button"]')].filter(isVisible).find(isRepostControl);
  if (!button) return { confirmed: false, detail: 'Repost button was not found on the visible LinkedIn post card.' };
  if (button.getAttribute('aria-pressed') === 'true' || labelled(button, isUndoRepost)) return { confirmed: false, detail: 'Post was already reposted.' };
  const before = describe(button);
  button.scrollIntoView({ block: 'center', inline: 'center' });
  button.click();

  let action;
  for (let attempt = 0; attempt < 12 && !action; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 300));
    action = [...document.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"], li, .artdeco-dropdown__item')]
      .filter(isVisible)
      .find(item => labelled(item, isInstantRepost) && !labelled(item, isCommentShare));
  }
  if (!action) return { confirmed: false, detail: "NexaShare opened the repost menu but could not identify LinkedIn's visible direct repost choice." };
  action.scrollIntoView({ block: 'center', inline: 'center' });
  action.click();

  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const controlChanged = button.getAttribute('aria-pressed') === 'true' || labelled(button, isUndoRepost) || describe(button) !== before;
    const notices = [...document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item, .artdeco-inline-feedback')].filter(isVisible);
    const successNotice = notices.find(item => isSuccessNotice(describe(item)));
    const viewRepost = successNotice && [...successNotice.querySelectorAll('a[href]')].find(link => labelled(link, isViewRepost));
    const repostUrl = viewRepost ? new URL(viewRepost.getAttribute('href'), location.origin).href : '';
    if (successNotice) return { confirmed: true, repostUrl, detail: repostUrl ? 'LinkedIn confirmed the repost and provided its View repost link.' : 'LinkedIn displayed a visible repost confirmation.' };
    if (controlChanged) return { confirmed: true, detail: 'LinkedIn visibly changed the repost control to its active state.' };
  }
  return { confirmed: false, detail: 'NexaShare selected LinkedIn\'s direct repost choice, but LinkedIn did not provide visible confirmation.' };
}

async function withBackgroundTab(url, operation) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabReady(tab.id);
    return await operation(tab.id);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (error) {}
  }
}

async function waitForTabReady(tabId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let tab;
    try { tab = await chrome.tabs.get(tabId); }
    catch (error) { throw new Error(`LinkedIn tab closed before it became ready: ${String(error)}`); }
    if (tab.status === 'complete') {
      await sleep(1000);
      return;
    }
    await sleep(500);
  }
  await sleep(PAGE_LOAD_MS);
}

function makeOutcome(company, post, status, detail, repostUrl = '') {
  const timestamp = new Date().toISOString();
  return {
    outcomeId: crypto.randomUUID(),
    companyName: company.name,
    postUrl: post.url,
    repostUrl: repostUrl || '',
    postTextSnippet: (post.text || '').slice(0, 500),
    status,
    detail,
    attemptedAt: timestamp,
    confirmedAt: status === 'confirmed' ? timestamp : null
  };
}

function makeCompanyOutcome(company, status, detail) {
  return {
    outcomeId: crypto.randomUUID(),
    companyName: company.name,
    postUrl: company.sourceType === 'person'
      ? `https://www.linkedin.com/in/${company.vanity}/recent-activity/all/`
      : `https://www.linkedin.com/company/${company.vanity}/posts/`,
    postTextSnippet: '',
    status,
    detail,
    attemptedAt: new Date().toISOString(),
    confirmedAt: null
  };
}

function rememberPost(seen, postId) {
  if (postId) seen.add(postId);
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

