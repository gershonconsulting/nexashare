const API_BASE = 'https://nexashare.com';
const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_DELAY_MS = 2000;
const REPOST_DELAY_MS = 3000;
const PAGE_LOAD_MS = 6000;
const POST_DISCOVERY_ATTEMPTS = 16;
const MAX_LOG_ENTRIES = 200;
const DAILY_ALARM = 'dailyRepost';
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
  if (!enabledCompanies.length) {
    for (const company of companies) outcomes.push(makeCompanyOutcome(company, 'skipped', 'Automatic reposting is paused for this company.'));
  }
  for (const company of enabledCompanies) {
    try {
      const scraped = await scrapeCompanyPosts(company);
      const posts = scraped.posts;
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
        outcomes.push(makeCompanyOutcome(company, scraped.notReady ? 'failed' : 'skipped', posts.length ? 'No new eligible posts were found.' : (scraped.notReady ? 'LinkedIn did not finish loading the posts after two fresh-tab attempts. NexaShare will retry automatically.' : 'No posts were found on the company page.')));
      }
      processedPostIds[sourceKey] = [...seen].slice(-500);
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
    retriedOutcomes: priorPendingCount
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

async function scrapeCompanyPosts(source) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    lastResult = await scrapeCompanyPostsOnce(source);
    if (!lastResult.notReady) return lastResult;
    await log('warn', 'company:load-retry', { company: source.name, attempt });
    if (attempt < 2) await sleep(1500 * attempt);
  }
  return lastResult || { companyName: '', posts: [], notReady: true };
}

async function scrapeCompanyPostsOnce(source) {
  const url = sourceUrl(source);
  return withBackgroundTab(url, async tabId => {
    const loaded = await waitForLinkedInPosts(tabId);
    if (!loaded) return { companyName: '', posts: [], notReady: true };
    for (let index = 0; index < MAX_SCROLL_ATTEMPTS; index++) {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollBy(0, 1500) });
      await sleep(SCROLL_DELAY_MS);
    }
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractCompanyPageFromDOM });
    return results?.[0]?.result || { companyName: '', posts: [], notReady: true };
  });
}

async function waitForLinkedInPosts(tabId) {
  for (let attempt = 0; attempt < POST_DISCOVERY_ATTEMPTS; attempt++) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"], [aria-label^="Open control menu for post by"]').length
    });
    if (Number(results?.[0]?.result) > 0) return true;
    await sleep(1250);
  }
  return false;
}

function extractCompanyPageFromDOM() {
  const byId = new Map();
  document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"], [data-view-name="feed-full-update"]').forEach(item => {
    const text = item.querySelector('.feed-shared-text, .update-components-text, [data-test-id="main-feed-activity-card__commentary"]')?.textContent?.trim() || '';
    const link = item.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
    const match = (item.getAttribute('data-urn') || '').match(/activity:(\d+)/) || link?.href?.match(/activity(?::|-)(\d+)/);
    if (!match) return;
    const id = match[1];
    if (byId.has(id)) return;
    const buttons = [...item.querySelectorAll('button, [role="button"]')];
    const button = buttons.find(candidate => {
      const value = `${candidate.getAttribute('aria-label') || ''} ${candidate.getAttribute('data-view-name') || ''} ${candidate.textContent || ''}`.toLowerCase();
      return /repost|reshare|republier|republication|reposten/.test(value);
    });
    byId.set(id, {
      id,
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
      text,
      alreadyReposted: !!button && (
        button.getAttribute('aria-pressed') === 'true' ||
        button.classList.contains('react-button--active') ||
        /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen/i.test(button.getAttribute('aria-label') || button.textContent)
      )
    });
  });
  if (!byId.size) {
    const stripPostHeader = value => {
      const head = value.slice(0, 140);
      const marker = head.indexOf('•');
      return (marker === -1 ? value : value.slice(marker + 1)).replace(/^[\s·]+/, '').trim();
    };
    const hashText = value => {
      let h = 5381;
      for (let i = 0; i < value.length; i++) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
      return `t${h.toString(36)}`;
    };
    const anchors = [...document.querySelectorAll('[aria-label]')]
      .filter(node => /^Open control menu for post by /i.test(node.getAttribute('aria-label') || ''));
    for (const anchor of anchors) {
      let node = anchor;
      let card = null;
      for (let depth = 0; depth < 12 && node; depth++) {
        node = node.parentElement;
        if (node && [...node.querySelectorAll('button, [role="button"]')]
          .some(control => /^repost$/i.test((control.getAttribute('aria-label') || '').trim()))) { card = node; break; }
      }
      if (!card) continue;
      const cardText = (card.innerText || '').replace(/\s+/g, ' ').replace(/^Feed post\s*/i, '').trim();
      if (!cardText) continue;
      const bodyText = stripPostHeader(cardText);
      if (!bodyText) continue;
      const matchText = bodyText.slice(0, 240);
      const id = hashText(matchText);
      if (byId.has(id)) continue;
      const control = [...card.querySelectorAll('button, [role="button"]')]
        .find(item => /^repost$/i.test((item.getAttribute('aria-label') || '').trim()));
      byId.set(id, {
        id,
        url: location.href.split('#')[0],
        inPlace: true,
        matchText,
        text: bodyText.slice(0, 1200),
        alreadyReposted: !!control && (
          control.getAttribute('aria-pressed') === 'true' ||
          /undo repost|remove repost|annuler la republication|supprimer la republication/i.test(control.getAttribute('aria-label') || '')
        )
      });
    }
  }
  const heading = document.querySelector('h1.org-top-card-summary__title, h1.org-top-card-summary-info-list__info-item, main h1');
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const rawName = heading?.textContent?.trim() || metaTitle.replace(/\s*[|\-]\s*LinkedIn.*$/i, '').trim();
  const companyName = rawName && !/^\d+$/.test(rawName) && !/^linkedin$/i.test(rawName) ? rawName.slice(0, 100) : '';
  return { companyName, posts: [...byId.values()] };
}

async function repostContent(post) {
  await log('info', 'repost:attempt', { postId: post.id, url: post.url, inPlace: !!post.inPlace });
  if (post.inPlace) return repostOnSourcePage(post);
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    result = await withBackgroundTab(post.url, async tabId => {
      const loaded = await waitForLinkedInPosts(tabId);
      if (!loaded) return { confirmed: false, retryable: true, detail: 'LinkedIn did not finish loading the post.' };
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: clickAndConfirmRepost });
      return results?.[0]?.result || { confirmed: false, retryable: true, detail: 'LinkedIn did not return an outcome.' };
    });
    if (result.confirmed || !result.retryable) break;
    await log('warn', 'repost:fresh-tab-retry', { postId: post.id, attempt });
    if (attempt < 2) await sleep(1500 * attempt);
  }
  result ||= { confirmed: false, detail: 'LinkedIn did not return an outcome after retry.' };
    if (result.confirmed && !result.repostUrl) {
      result.detail += ' LinkedIn confirmed the repost, but did not expose a View repost link to record.';
    }
    await log(result.confirmed ? 'info' : 'warn', result.confirmed ? 'repost:confirmed' : 'repost:not-confirmed', { postId: post.id, detail: result.detail });
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
    const tab = await chrome.tabs.get(tabId);
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

