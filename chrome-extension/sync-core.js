const API_BASE = 'https://nexashare.com';
const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_DELAY_MS = 2000;
const REPOST_DELAY_MS = 3000;
const PAGE_LOAD_MS = 6000;
const MAX_LOG_ENTRIES = 200;
const DAILY_ALARM = 'dailyRepost';

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
  if (alarm.name === DAILY_ALARM) {
    runFullSync({ trigger: 'scheduled' }).catch(error => log('error', 'scheduled-run:failed', { error: String(error) }));
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

async function runFullSync({ trigger = 'manual' } = {}) {
  await chrome.storage.local.set({ nexashareLog: [] });
  await log('info', 'run:start', { trigger });
  setBadge('…', '#6b7280');

  let companies;
  try {
    const data = await authenticatedFetch('/api/companies');
    companies = data.companies || [];
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
  if (!enabledCompanies.length) {
    for (const company of companies) outcomes.push(makeCompanyOutcome(company, 'skipped', 'Automatic reposting is paused for this company.'));
  }
  for (const company of enabledCompanies) {
    try {
      const scraped = await scrapeCompanyPosts(company);
      const posts = scraped.posts;
      if (scraped.companyName && scraped.companyName !== company.name) {
        await authenticatedFetch(`/api/companies/${company.id}`, {
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
      const seen = new Set(processedPostIds[String(company.id)] || []);
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
        outcomes.push(makeCompanyOutcome(company, 'skipped', posts.length ? 'No new eligible posts were found.' : 'No posts were found on the company page.'));
      }
      processedPostIds[String(company.id)] = [...seen].slice(-500);
    } catch (error) {
      await log('error', 'company:failed', { company: company.name, error: String(error) });
      outcomes.push(makeCompanyOutcome(company, 'failed', String(error)));
    }
  }
  await chrome.storage.local.set({ processedPostIds });

  let reported = false;
  try {
    if (outcomes.length) {
      await authenticatedFetch('/api/extension/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcomes })
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
    retriedOutcomes: priorPendingCount
  };
  await chrome.storage.local.set({ lastSyncResult: result });
  await log('info', 'run:done', result);
  setBadge(result.totalFailed || !reported ? '!' : '✓', result.totalFailed || !reported ? '#dc2626' : '#059669');
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

async function scrapeCompanyPosts(company) {
  const url = `https://www.linkedin.com/company/${company.vanity}/posts/?feedView=all`;
  return withBackgroundTab(url, async tabId => {
    for (let index = 0; index < MAX_SCROLL_ATTEMPTS; index++) {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollBy(0, 1500) });
      await sleep(SCROLL_DELAY_MS);
    }
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractCompanyPageFromDOM });
    return results?.[0]?.result || { companyName: '', posts: [] };
  });
}

function extractCompanyPageFromDOM() {
  const posts = [];
  document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"], .occludable-update, [data-view-name="feed-full-update"]').forEach(item => {
    const text = item.querySelector('.feed-shared-text, .update-components-text, [data-test-id="main-feed-activity-card__commentary"]')?.textContent?.trim() || '';
    const link = item.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
    const match = (item.getAttribute('data-urn') || '').match(/activity:(\d+)/) || link?.href?.match(/activity(?::|-)(\d+)/);
    if (!text && !match) return;
    const button = item.querySelector('button[aria-label*="Repost"], button[aria-label*="repost"], button[data-view-name*="repost"]');
    posts.push({
      id: match?.[1] || `post-${posts.length}`,
      url: match ? `https://www.linkedin.com/feed/update/urn:li:activity:${match[1]}/` : '',
      text,
      alreadyReposted: !!button && (
        button.getAttribute('aria-pressed') === 'true' ||
        button.classList.contains('react-button--active') ||
        /undo repost|remove repost/i.test(button.getAttribute('aria-label') || button.textContent)
      )
    });
  });
  const heading = document.querySelector('h1.org-top-card-summary__title, h1.org-top-card-summary-info-list__info-item, main h1');
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const rawName = heading?.textContent?.trim() || metaTitle.replace(/\s*[|\-]\s*LinkedIn.*$/i, '').trim();
  const companyName = rawName && !/^\d+$/.test(rawName) && !/^linkedin$/i.test(rawName) ? rawName.slice(0, 100) : '';
  return { companyName, posts };
}

async function repostContent(post) {
  await log('info', 'repost:attempt', { postId: post.id, url: post.url });
  return withBackgroundTab(post.url, async tabId => {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: clickAndConfirmRepost });
    const result = results?.[0]?.result || { confirmed: false, detail: 'LinkedIn did not return an outcome.' };
    if (result.confirmed) {
      try {
        result.repostUrl = await findConfirmedRepostUrl(post.id);
        if (!result.repostUrl) result.detail += ' The repost link was not exposed by LinkedIn and was not recorded.';
      } catch (error) {
        result.detail += ' The repost was confirmed, but its separate link could not be captured.';
      }
    }
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
  const button = [...document.querySelectorAll('button')].find(item => {
    const label = (item.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('repost') || item.textContent.toLowerCase().includes('repost');
  });
  if (!button) return { confirmed: false, detail: 'Repost button was not found in the visible LinkedIn UI.' };
  if (button.getAttribute('aria-pressed') === 'true') return { confirmed: false, detail: 'Post was already reposted.' };
  button.click();
  await new Promise(resolve => setTimeout(resolve, 1500));
  const action = [...document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item, .social-reshare-button')].find(item => {
    const text = item.textContent.toLowerCase();
    return text.includes('repost') && !text.includes('with your thoughts') && !text.includes('quote');
  });
  if (!action) return { confirmed: false, detail: 'LinkedIn did not show a direct repost action.' };
  action.click();
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const current = [...document.querySelectorAll('button')].find(item => {
      const label = (item.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('repost') || item.textContent.toLowerCase().includes('repost');
    });
    if (current && (
      current.getAttribute('aria-pressed') === 'true' ||
      current.classList.contains('react-button--active') ||
      /undo repost|remove repost/i.test(current.getAttribute('aria-label') || current.textContent)
    )) return { confirmed: true, detail: 'LinkedIn visibly changed the repost control to its active state.' };
  }
  return { confirmed: false, detail: 'The action was clicked, but LinkedIn did not visibly confirm the repost.' };
}

async function withBackgroundTab(url, operation) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await sleep(PAGE_LOAD_MS);
    return await operation(tab.id);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (error) {}
  }
}

function makeOutcome(company, post, status, detail, repostUrl = '') {
  const timestamp = new Date().toISOString();
  return {
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
    companyName: company.name,
    postUrl: `https://www.linkedin.com/company/${company.vanity}/posts/`,
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
