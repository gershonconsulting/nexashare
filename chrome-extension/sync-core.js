const API_BASE = 'https://nexashare.com';
const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_DELAY_MS = 2000;
const REPOST_DELAY_MS = 3000;
const SOURCE_DELAY_MS = 5000;
const PAGE_LOAD_MS = 6000;
const POST_DISCOVERY_ATTEMPTS = 16;
const MAX_LOG_ENTRIES = 500;
let activeRunId = null;
const DAILY_ALARM = 'dailyRepost';
const RETRY_ALARM = 'retryRepost';
const COMMAND_ALARM = 'serverCommands';
const RETRY_DELAYS_MINUTES = [5, 20, 60];
const SOURCE_DISCOVERY_ATTEMPTS = 3;
const REPOST_ATTEMPTS = 4;
const MAX_POST_AGE_DAYS = 30;
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
let activeSyncPromise = null;

async function log(level, message, data) {
  const entry = { ts: new Date().toISOString(), runId: activeRunId, level, msg: message, data: data === undefined ? null : data };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[NexaShare]', message, data || '');
  const stored = await chrome.storage.local.get('nexashareLog');
  await chrome.storage.local.set({ nexashareLog: [entry, ...(stored.nexashareLog || [])].slice(0, MAX_LOG_ENTRIES) });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm();
  chrome.action.setBadgeBackgroundColor({ color: '#FE1B04' });
  log('info', 'Extension installed; automatic daily check enabled');
});

chrome.runtime.onStartup.addListener(() => { ensureDailyAlarm(); ensureCommandAlarm(); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === COMMAND_ALARM) {
    pollServerCommands().catch(error => log('error', 'command:poll-failed', { error: String(error) }));
    return;
  }
  if (alarm.name === DAILY_ALARM || alarm.name === RETRY_ALARM) {
    const trigger = alarm.name === RETRY_ALARM ? 'automatic-retry' : 'scheduled';
    runFullSync({ trigger }).catch(error => log('error', 'scheduled-run:failed', { error: String(error), trigger }));
  }
});

async function ensureDailyAlarm() {
  const existing = await chrome.alarms.get(DAILY_ALARM);
  if (!existing) chrome.alarms.create(DAILY_ALARM, { delayInMinutes: 15, periodInMinutes: 1440 });
}

async function ensureCommandAlarm() {
  const existing = await chrome.alarms.get(COMMAND_ALARM);
  if (!existing) chrome.alarms.create(COMMAND_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
}

async function pollServerCommands() {
  const response = await authenticatedFetch('/api/extension/commands/next');
  const command = response?.command;
  if (!command) return { status: 'idle' };
  let status = 'completed';
  let result;
  try {
    const name = String(command.command || '').toLowerCase().replace(/[- ]/g, '_');
    if (!['run_now', 'run_repost', 'sync_now', 'force_repost'].includes(name)) throw new Error('Unsupported extension command: ' + command.command);
    result = await runFullSync({ trigger: 'server-command' });
  } catch (error) {
    status = 'failed';
    result = { error: String(error) };
  }
  await authenticatedFetch('/api/extension/commands/' + command.id + '/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, result })
  });
  return { status, commandId: command.id, result };
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
    headers: { ...(options.headers || {}), Authorization: `Bearer ${stored.apiToken}`, 'X-NexaShare-Extension-Version': EXTENSION_VERSION }
  });
  if (!response.ok && path.startsWith('/api/extension/repost-thoughts')) {const problem=await response.json().catch(()=>({}));throw new Error(problem.error||`Automatic thoughts returned HTTP ${response.status}`);}
  if (!response.ok) throw new Error(response.status === 409
    ? 'Update the NexaShare extension from the dashboard before reposting.'
    : `NexaShare API returned HTTP ${response.status}. Reconnect the extension from the dashboard.`);
  return response.json();
}

function runFullSync(options = {}) {
  if (activeSyncPromise) {
    log('warn', 'run:already-active', { requestedTrigger: options.trigger || 'manual' });
    return activeSyncPromise;
  }
  activeRunId = crypto.randomUUID();
  activeSyncPromise = runFullSyncUnlocked(options).finally(() => {
    activeSyncPromise = null;
    activeRunId = null;
  });
  return activeSyncPromise;
}

async function runFullSyncUnlocked({ trigger = 'manual' } = {}) {
  await chrome.storage.local.set({ nexashareLog: [] });
  await log('info', 'run:start', { trigger });
  setBadge('â€¦', '#6b7280');

  let companies;
  let thoughtsMode;
  try {
    const [companyData, peopleData, mode] = await Promise.all([
      authenticatedFetch('/api/companies'),
      authenticatedFetch('/api/people'),
      authenticatedFetch('/api/extension/repost-thoughts')
    ]);
    thoughtsMode = mode;
    companies = [
      ...(companyData.companies || []).map(item => ({ ...item, sourceType: 'company' })),
      ...(peopleData.people || []).map(item => ({ ...item, sourceType: 'person' }))
    ];
    await chrome.storage.local.set({ companies, syncProgress: { runId: activeRunId, state: 'running', stage: `Loaded ${companies.length} configured sources`, trigger, ts: new Date().toISOString() } });
    await log('info', 'sources:loaded', { count: companies.length });
    await captureRunDiagnostic('run_started', { trigger, sourceCount: companies.length, extensionVersion: EXTENSION_VERSION });
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

  await chrome.storage.local.set({ syncProgress: { runId: activeRunId, state: 'running', stage: 'Checking LinkedIn session', trigger, ts: new Date().toISOString() } });
  if (!(await ensureLinkedInSession())) {
    await log('warn', 'LinkedIn sign-in is required. NexaShare opened LinkedIn automatically, but no signed-in session was detected.', { trigger });
    setBadge('!', '#dc2626');
    const waiting = { status: 'not-logged-in', trigger, ts: new Date().toISOString() };
    await chrome.storage.local.set({ lastSyncResult: waiting });
    await captureRunDiagnostic('run_blocked', { trigger, reason: 'linkedin_login_required', extensionVersion: EXTENSION_VERSION });
    return waiting;
  }

  await log('info', 'linkedin:connected', {});
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
      const diagnostic = {
        sourceType: company.sourceType || 'company',
        sourceId: String(company.id || '').slice(0, 100),
        sourceVanity: String(company.vanity || '').slice(0, 100),
        discoveryRoute: scraped.discoveryRoute || 'none',
        discoveryReason: scraped.reason || scraped.discoveryFallbackReason || '',
        recoveryAttempt: scraped.recoveryAttempt || 1
      };
      const outcomeFor = (post, status, detail, repostUrl) => ({ ...makeOutcome(company, post, status, detail, repostUrl), diagnostic });
      const sourceOutcomeFor = (status, detail) => ({ ...makeCompanyOutcome(company, status, detail), diagnostic });
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
        const postedMs = activityTimeMs(post.id);
        if (postedMs && Date.now() - postedMs > MAX_POST_AGE_DAYS * 86400000) continue;
        if (post.alreadyReposted) {
          outcomes.push(outcomeFor( post, 'already_reposted', 'LinkedIn already showed this post as reposted.'));
          rememberPost(seen, post.id);
          continue;
        }
        candidateHandled = true;
        try {
          const claim = await authenticatedFetch('/api/extension/deliveries/processing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postUrl: deliveryPostUrl(post) })
          });
          if (claim.acquired !== true) {
            await log('info', 'repost:claim-blocked', { postId: post.id });
            continue;
          }
          await chrome.storage.local.set({ syncProgress: { runId: activeRunId, state: 'running', stage: `Attempting repost for ${company.name || company.vanity || 'source'}`, source: company.name || company.vanity || '', trigger, ts: new Date().toISOString() } });
          await log('info', 'repost:attempt', { company: company.name || company.vanity, postUrl: post.url });
          let result;
          if (thoughtsMode?.enabled) {
            let draft;
            try{draft=await authenticatedFetch('/api/extension/repost-thoughts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postUrl:deliveryPostUrl(post),postText:post.text||'',sourceName:company.name||'',authorName:post.authorName||company.name||''})});}
            catch(error){result={confirmed:false,thoughtsSubmitted:false,detail:'Automatic thoughts unavailable before publishing. '+String(error)};}
            if(draft)result=await repostContentWithThoughts(post,draft);
          } else result=await repostContent(post);
          await log(result.confirmed ? 'info' : 'error', result.confirmed ? 'repost:confirmed' : 'repost:failed', { company: company.name || company.vanity, detail: result.detail, repostUrl: result.repostUrl || null });
          const alreadyReposted = /post was already reposted/i.test(result.detail || '');
          outcomes.push({ ...outcomeFor( post, result.confirmed ? 'confirmed' : alreadyReposted ? 'already_reposted' : 'failed', result.detail, result.repostUrl), ...(result.thoughtsId?{thoughtsId:result.thoughtsId,thoughtsText:result.thoughtsText,thoughtsSubmitted:result.thoughtsSubmitted,thoughtsConfirmed:result.thoughtsConfirmed}: {}) });
          if (result.confirmed || alreadyReposted) {
            rememberPost(seen, post.id);
            processedPostIds[sourceKey] = [...seen].slice(-500);
            await chrome.storage.local.set({ processedPostIds });
          }
          // Persist each outcome immediately, before another source or sleep.
          await chrome.storage.local.set({ pendingOutcomes: outcomes.slice(-200) });
        } catch (error) {
          outcomes.push(outcomeFor( post, 'failed', 'LinkedIn did not return an outcome. ' + String(error)));
          await chrome.storage.local.set({ pendingOutcomes: outcomes.slice(-200) });
        }
        await sleep(REPOST_DELAY_MS + Math.random() * 2000);
        break;
      }
      if (!candidateHandled && !posts.some(post => post.alreadyReposted && !seen.has(post.id))) {
        outcomes.push(sourceOutcomeFor( scraped.notReady ? 'failed' : 'skipped', posts.length ? 'No new eligible posts were found.' : (scraped.notReady ? discoveryFailureDetail(scraped.reason) : 'No posts were found on the company page.')));
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
  await captureRunDiagnostic('run_completed', { ...result, extensionVersion: EXTENSION_VERSION });
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
    linkedin_layout_unrecognized: 'LinkedIn loaded, but its post-card layout was not recognized. NexaShare skipped this source, continued with the others, and scheduled a controlled retry.'
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
    // Data-first discovery (1.2.28): read LinkedIn's own company-feed data instead of
    // waiting for the page to paint. An unfocused/occluded collection window often never
    // renders post cards, which is what produced the linkedin_layout_unrecognized failures.
    let discoveryFallbackReason = '';
    if (source.sourceType !== 'person' && source.vanity) {
      try {
        const dataResults = await chrome.scripting.executeScript({
          target: { tabId },
          func: discoverCompanyPostsViaData,
          args: [String(source.vanity)]
        });
        const viaData = dataResults?.[0]?.result;
        if (viaData?.ok && viaData.posts?.length) {
          await log('info', 'company:discovered-via-data', {
            company: source.name || source.vanity,
            posts: viaData.posts.length,
            newest: viaData.posts[0]?.postedAt || ''
          });
          return { companyName: '', posts: viaData.posts, detectors: viaData.detectors || ['data-graphql'], discoveryRoute: 'data', recoveryAttempt };
        }
        discoveryFallbackReason = String(viaData?.reason || 'no_result').slice(0, 150);
        await log('warn', 'company:data-discovery-fallback', { company: source.name || source.vanity, reason: discoveryFallbackReason });
      } catch (error) {
        if (/No tab with id/i.test(String(error))) return { companyName: '', posts: [], notReady: true, reason: 'linkedin_tab_closed' };
        discoveryFallbackReason = 'exception';
        await log('warn', 'company:data-discovery-fallback', { company: source.name || source.vanity, reason: String(error).slice(0, 200) });
      }
    }

    const readiness = await waitForLinkedInPosts(tabId);
    if (!readiness.ready) {
      await captureDiagnostic(tabId, crypto.randomUUID(), 'discovery_failed', {
        sourceId: source.id,
        sourceType: source.sourceType,
        sourceName: source.name || source.vanity || '',
        recoveryAttempt,
        reason: readiness.reason || 'linkedin_layout_unrecognized',
        layoutFingerprint: readiness.layoutFingerprint || 'unknown',
        detectors: readiness.detectors || []
      });
      return {
        companyName: '',
        posts: [],
        notReady: true,
        discoveryRoute: 'none',
        discoveryFallbackReason,
        recoveryAttempt,
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
    extracted.posts = sortPostsNewestFirst(extracted.posts || []);
    if (!extracted.posts?.length && readiness.ready) {
      await captureDiagnostic(tabId, crypto.randomUUID(), 'discovery_failed', {
        sourceId: source.id,
        sourceType: source.sourceType,
        sourceName: source.name || source.vanity || '',
        recoveryAttempt,
        reason: 'linkedin_layout_unrecognized',
        layoutFingerprint: readiness.layoutFingerprint || extracted.layoutFingerprint || 'unknown',
        detectors: extracted.detectors || readiness.detectors || []
      });
      return {
        discoveryRoute: 'none', discoveryFallbackReason, recoveryAttempt,
        ...extracted,
        notReady: true,
        reason: 'linkedin_layout_unrecognized',
        layoutFingerprint: readiness.layoutFingerprint || extracted.layoutFingerprint || 'unknown'
      };
    }
    return { ...extracted, discoveryRoute: 'dom', discoveryFallbackReason, recoveryAttempt };
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
    '[data-chameleon-result-urn*="activity"]',
    '[data-view-name="feed-full-update"]',
    '[data-view-name*="feed-update"]',
    '[data-testid*="feed-update"]',
    'article[data-urn]',
    'main article'
  ].join(','));
  if (structuralCards.length) detectors.push('structural-card');

  const activityLinks = document.querySelectorAll('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
  if (activityLinks.length) detectors.push('activity-link');

  const semanticControls = document.querySelectorAll(
    '[data-view-name*="repost"], [data-view-name*="reshare"], button[aria-pressed][aria-label*="repost" i], button[aria-pressed][aria-label*="reshare" i], .social-reshare-button'
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

// LinkedIn activity ids are snowflakes: the top bits are the publish time in ms.
// Sorting by id gives true newest-first order (the company feed itself is not chronological).
function activityTimeMs(id) {
  try { return /^\d{15,}$/.test(String(id)) ? Number(BigInt(id) >> 22n) : 0; } catch (error) { return 0; }
}

function sortPostsNewestFirst(posts) {
  if (!posts.length || !posts.every(post => activityTimeMs(post.id) > 0)) return posts;
  return [...posts].sort((a, b) => activityTimeMs(b.id) - activityTimeMs(a.id));
}

// Injected into a linkedin.com tab. Needs no rendering: fetches the company Posts page HTML
// for the rotating GraphQL queryId and the page id, then asks LinkedIn's own company-feed
// endpoint for the latest posts. Must stay self-contained (executeScript serialises it).
async function discoverCompanyPostsViaData(vanity) {
  const result = { ok: false, reason: '', posts: [], detectors: ['data-graphql'] };
  const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1];
    if (!csrf) { result.reason = 'no_csrf'; return result; }
    const pageRes = await fetch('/company/' + encodeURIComponent(vanity) + '/posts/?feedView=all&viewAsMember=true', { credentials: 'include' });
    if (!pageRes.ok) { result.reason = 'page_http_' + pageRes.status; return result; }
    if (/\/(login|uas\/login|checkpoint|authwall)/.test(new URL(pageRes.url).pathname)) { result.reason = 'signed_out'; return result; }
    const html = (await pageRes.text()).replace(/&quot;/g, '"').replace(/&#61;/g, '=');
    const queryId = (html.match(/voyagerFeedDashOrganizationalPageUpdates\.[0-9a-f]{20,}/) || [])[0];
    if (!queryId) { result.reason = 'no_query_id'; return result; }
    const anchor = html.search(new RegExp('"universalName":"' + escapeRe(vanity) + '"', 'i'));
    let pageId = '';
    if (anchor !== -1) {
      let best = Infinity;
      const re = /urn:li:fsd_company:(\d+)/g;
      let match;
      while ((match = re.exec(html))) {
        const distance = Math.abs(match.index - anchor);
        if (distance < best && distance < 4000) { best = distance; pageId = match[1]; }
      }
    }
    if (!pageId) { result.reason = 'no_page_id'; return result; }
    const variables = '(count:10,start:0,moduleKey:ORGANIZATION_MEMBER_FEED_DESKTOP,organizationalPageUrn:urn%3Ali%3Afsd_organizationalPage%3A' + pageId + ')';
    const apiRes = await fetch('/voyager/api/graphql?variables=' + variables + '&queryId=' + queryId, {
      credentials: 'include',
      headers: { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0', accept: 'application/vnd.linkedin.normalized+json+2.1' }
    });
    if (!apiRes.ok) { result.reason = 'api_http_' + apiRes.status; return result; }
    const body = await apiRes.text();
    // Read only commentary tied to this activity, never actor names, quoted
    // posts or unrelated text elsewhere in the normalized response.
    const textById = new Map();
    try {
      const payload = JSON.parse(body);
      const entities = Array.isArray(payload.included) ? payload.included : [];
      const byUrn = new Map(entities.map(entity => [entity.entityUrn, entity]));
      for (const entity of entities) {
        const identity = String(entity.entityUrn || entity.updateUrn || '');
        const id = (identity.match(/(?:activity:|updateV2:\(urn:li:activity:)(\d{15,})/) || [])[1];
        if (!id) continue;
        const commentary = entity.commentary || byUrn.get(entity['*commentary']);
        const value = typeof commentary === 'string' ? commentary : (commentary?.text?.text || commentary?.text);
        if (typeof value === 'string' && value.trim()) textById.set(id, value.trim().slice(0, 2000));
      }
    } catch (_) { /* Discovery still works when text cannot be recovered. */ }
    const ids = [...new Set(body.match(/urn:li:activity:\d{15,}/g) || [])].map(urn => urn.split(':').pop());
    ids.sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0));
    result.posts = ids.map(id => ({
      id,
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:' + id + '/',
      postedAt: new Date(Number(BigInt(id) >> 22n)).toISOString(),
      text: textById.get(id) || '',
      textStatus: textById.has(id) ? 'available' : 'unavailable',
      textReason: textById.has(id) ? '' : 'company_data_commentary_missing',
      alreadyReposted: false
    }));
    result.ok = result.posts.length > 0;
    if (!result.ok) result.reason = 'api_no_posts';
    return result;
  } catch (error) {
    result.reason = 'error:' + String(error).slice(0, 200);
    return result;
  }
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
    '[data-chameleon-result-urn*="activity"]',
    '[data-view-name="feed-full-update"]',
    '[data-view-name*="feed-update"]',
    '[data-testid*="feed-update"]',
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
      item.getAttribute?.('data-chameleon-result-urn') || '',
      ...[...(item.querySelectorAll?.('a[href]') || [])].slice(0, 20).map(link => link.href || '')
    ].join(' ');
    return evidence.match(/(?:urn:li:activity:|activity(?::|-))(\d{6,})/i)?.[1] || '';
  };

  const controlFor = item => {
    const semantic = item.querySelector(
      '[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button, button[aria-pressed][aria-label*="repost" i], button[aria-pressed][aria-label*="reshare" i]'
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
        /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen|deshacer republicación|eliminar republicación|annulla ripubblicazione|rimuovi ripubblicazione/i.test(controlText)
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
      '[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button, button, [role="button"]'
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
          /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen|deshacer republicación|eliminar republicación|annulla ripubblicazione|rimuovi ripubblicazione/i.test(control.getAttribute('aria-label') || '')
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

      const traceId = crypto.randomUUID();
      await captureDiagnostic(tabId, traceId, 'post_ready', { postId: post.id, attempt, url: post.url, readiness });
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: clickAndConfirmRepost });
      const outcome = results?.[0]?.result || { confirmed: false, detail: 'LinkedIn did not return an outcome.' };
      await captureDiagnostic(tabId, traceId, outcome.confirmed ? 'repost_confirmed' : 'repost_failed', { postId: post.id, attempt, outcome });
      return outcome;
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
  const isRepostControl = value => /\brepost\b|\breshare\b|republier|republication|reposter|reposten|erneut teilen|volver a publicar|compartir de nuevo|ripubblica|ricondividi/.test(value);
  const isCommentShare = value => /with your thoughts|quote|ajouter (?:vos|mes) réflexions|avec (?:vos|mes) réflexions|avec un commentaire|gedanken hinzufügen|mit (?:ihren|deinen|eigenen) gedanken|mit kommentar/.test(value);
  const isUndoRepost = value => /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen|deshacer republicación|eliminar republicación|annulla ripubblicazione|rimuovi ripubblicazione/.test(value);
  const isInstantRepost = value => /^(?:repost|reshare) instantly\b/.test(value)
    || /^(?:repost|reshare)\b[^]*\binstantly\b/.test(value)
    || /^republier (?:instantanément|maintenant)\b/.test(value)
    || /^republier\b[^]*instantan/.test(value)
    || /^(?:jetzt|sofort|direkt) reposten\b/.test(value)
    || /^reposten\b/.test(value)
    || /^(?:volver a publicar|compartir de nuevo)(?: ahora| al instante)?$/.test(value)
    || /^(?:ripubblica|ricondividi)(?: ora| subito)?$/.test(value);
  // LinkedIn labels some controls with BOTH aria-label and identical inner text, so the
  // concatenated describe() reads "repost repost" and anchored predicates never match.
  const labelsOf = item => [item?.getAttribute?.('aria-label') || '', item?.getAttribute?.('data-view-name') || '', item?.textContent || '']
    .map(value => value.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .concat(describe(item));
  const labelled = (item, predicate) => labelsOf(item).some(predicate);
  const isSuccessNotice = value => /repost successful|reposted|post shared|shared successfully|republication réussie|publication republiée|a été republié|erfolgreich repostet|beitrag (?:wurde )?repostet|repost erfolgreich|publicación compartida|se ha vuelto a publicar|post ripubblicato/.test(value) && !/could not|error|failed|impossible|erreur|échec|fehlgeschlagen|fehler|no se pudo|errore|non riuscit/.test(value);
  const isViewRepost = value => /view repost|view reshare|voir la republication|republication anzeigen|repost anzeigen|ver republicación|visualizza ripubblicazione/.test(value);
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
        // Never select the original repost control as the popup action. In German,
        // the control itself is labelled "Reposten", which also matches the direct-
        // repost predicate and would otherwise be clicked again, closing the menu.
        return item !== button && labelled(item, isInstantRepost) && !labelled(item, isCommentShare);
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
    || /^reposten\b/.test(value)
    || /^(?:volver a publicar|compartir de nuevo)(?: ahora| al instante)?$/.test(value)
    || /^(?:ripubblica|ricondividi)(?: ora| subito)?$/.test(value);
  const isUndoRepost = value => /undo repost|remove repost|annuler la republication|supprimer la republication|repost rückgängig|repost entfernen|repost löschen|nicht mehr teilen/.test(value);
  const isSuccessNotice = value => /repost successful|reposted|post shared|shared successfully|républication réussie|republication réussie|publication republiée|a été republié|erfolgreich repostet|beitrag (?:wurde )?repostet|repost erfolgreich|publicación compartida|se ha vuelto a publicar|post ripubblicato/.test(value) && !/could not|error|failed|impossible|erreur|échec|fehlgeschlagen|fehler|no se pudo|errore|non riuscit/.test(value);
  const isViewRepost = value => /view repost|view reshare|voir la republication|republication anzeigen|repost anzeigen|ver republicación|visualizza ripubblicazione/.test(value);
  const isRepostControl = item => {
    const aria = (item.getAttribute('aria-label') || '').trim();
    const view = (item.getAttribute('data-view-name') || '').trim();
    if (/repost|reshare/i.test(view)) return true;
    if (/^(?:repost|reshare|republier|reposter|reposten|teilen|erneut teilen|volver a publicar|ripubblica|ricondividi)$/i.test(aria)) return true;
    return item.classList.contains('social-reshare-button');
  };

  const wanted = String(matchText || '').replace(/\s+/g, ' ').trim().slice(0, 240).toLowerCase();
  const anchors = [...document.querySelectorAll('[aria-label], [data-view-name]')]
    .filter(node => {
      const value = ((node.getAttribute('aria-label') || '') + ' ' + (node.getAttribute('data-view-name') || '')).trim();
      return /open control menu for post by|steuerungsmenü.*beitrag|kontrollmenü.*beitrag|menü.*beitrag|menu.*publication|control menu|feed.*control/i.test(value);
    });
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
    const marker = head.indexOf('•');
    const text = (marker === -1 ? raw : raw.slice(marker + 1)).replace(/^[\s·]+/, '').trim().toLowerCase();
    if (!wanted || text.slice(0, 240) === wanted || text.includes(wanted.slice(0, 120))) { card = candidate; break; }
  }

  // Fallback: re-find the card exactly the way extractCompanyPageFromDOM's text-hash
  // fallback found it (walk up from a visible repost control), so a post discovered
  // without a "control menu" anchor or an exact aria-label can still be matched.
  let fallbackControl = null;
  if (!card && wanted) {
    const discoveryRepost = /repost|reshare|republier|republication|reposter|reposten|teilen|erneut teilen|volver a publicar|ripubblica|ricondividi/i;
    const strictRepost = /repost|reshare|republier|reposter|reposten|erneut teilen|volver a publicar|ripubblica|ricondividi/i;
    const controlsForFallback = [...document.querySelectorAll(
      '[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button, button, [role="button"]'
    )].filter(node => {
      if (node.matches('[data-view-name*="repost"], [data-view-name*="reshare"], .social-reshare-button')) return true;
      return discoveryRepost.test((node.getAttribute('aria-label') || '') + ' ' + (node.textContent || ''));
    });
    for (const control of controlsForFallback) {
      let node = control;
      let candidate = null;
      for (let depth = 0; depth < 14 && node; depth++) {
        node = node.parentElement;
        if (!node) break;
        const textLength = (node.innerText || '').replace(/\s+/g, ' ').trim().length;
        if (textLength >= 40 && textLength <= 12000) candidate = node;
        if (node.tagName === 'ARTICLE' || node.hasAttribute('data-urn')) break;
      }
      if (!candidate) continue;
      const raw = (candidate.innerText || '').replace(/\s+/g, ' ').replace(/^Feed post\s*/i, '').trim();
      const marker = raw.slice(0, 140).indexOf('•');
      const text = (marker === -1 ? raw : raw.slice(marker + 1)).replace(/^[\s·]+/, '').trim().toLowerCase();
      if (text.slice(0, 240) !== wanted && !text.includes(wanted.slice(0, 120))) continue;
      const label = (control.getAttribute('aria-label') || '') + ' ' + (control.getAttribute('data-view-name') || '') + ' ' + (control.textContent || '');
      if (!isVisible(control) || labelled(control, isCommentShare)) continue;
      if (!isRepostControl(control) && !strictRepost.test(label)) continue;
      card = candidate;
      fallbackControl = control;
      break;
    }
  }
  if (!card) return { confirmed: false, detail: 'NexaShare could not find this post again on the LinkedIn page; it may have moved or been removed.' };

  const button = [...card.querySelectorAll('button, [role="button"]')].filter(isVisible).find(isRepostControl) || fallbackControl;
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
      .find(item => item !== button && labelled(item, isInstantRepost) && !labelled(item, isCommentShare));
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

async function captureDiagnostic(tabId, traceId, stage, metadata = {}) {
  try {
    const stateResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        url: location.href,
        title: document.title,
        visibleText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000),
        controls: [...document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="status"], [role="alert"]')]
          .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .slice(0, 80)
          .map(el => ({ role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 200) }))
      })
    });
    const payload = { traceId, stage, ts: new Date().toISOString(), metadata, state: stateResult?.[0]?.result || null };
    await log('info', 'diagnostic:stage', payload);
    await authenticatedFetch('/api/extension/diagnostics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (error) {
    await log('warn', 'diagnostic:capture-failed', { traceId, stage, error: String(error) });
  }
}

async function captureRunDiagnostic(stage, metadata = {}) {
  const payload = {
    traceId: activeRunId || crypto.randomUUID(),
    stage,
    ts: new Date().toISOString(),
    metadata,
    state: null
  };
  try {
    await log('info', 'diagnostic:stage', payload);
    await authenticatedFetch('/api/extension/diagnostics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (error) {
    await log('warn', 'diagnostic:capture-failed', { traceId: payload.traceId, stage, error: String(error) });
  }
}

async function withBackgroundTab(url, operation) {
  // LinkedIn defers parts of its SPA when a page is opened as an inactive tab.
  // Keep the collection page active in its own unfocused window instead: the page
  // renders normally, but the user's current window and tab are left untouched.
  let previousWindowId = null;
  let collectionWindow = null;
  try {
    const previousWindow = await chrome.windows.getLastFocused();
    previousWindowId = previousWindow?.id ?? null;
  } catch (error) {}

  try {
    collectionWindow = await chrome.windows.create({
      url,
      focused: false,
      type: 'normal',
      width: 1280,
      height: 900,
      top: 0,
      left: 0
    });
    const tabId = collectionWindow.tabs?.[0]?.id;
    if (tabId == null) throw new Error('NexaShare could not create its background LinkedIn page.');
    await restoreUserWindowFocus(previousWindowId);
    await waitForTabReady(tabId);
    return await operation(tabId);
  } finally {
    if (collectionWindow?.id != null) {
      try { await chrome.windows.remove(collectionWindow.id); } catch (error) {}
    }
    await restoreUserWindowFocus(previousWindowId);
  }
}

async function restoreUserWindowFocus(windowId) {
  if (windowId == null) return;
  try { await chrome.windows.update(windowId, { focused: true }); } catch (error) {}
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

function deliveryPostUrl(post) {
  // Text-identified cards share the company feed URL but are distinct posts.
  return post.inPlace ? `${post.url.split('#')[0]}#nexashare-post=${encodeURIComponent(post.id)}` : post.url;
}

function makeOutcome(company, post, status, detail, repostUrl = '') {
  const timestamp = new Date().toISOString();
  return {
    outcomeId: crypto.randomUUID(),
    companyName: company.name,
    postUrl: deliveryPostUrl(post),
    repostUrl: repostUrl || '',
    postTextSnippet: (post.text || '').slice(0, 2000),
    status,
    detail: post.textStatus === 'unavailable' ? `${detail} [Post text unavailable: ${post.textReason}]` : detail,
    textStatus: post.text ? 'available' : 'unavailable',
    textReason: post.text ? '' : (post.textReason || 'post_text_not_found'),
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


// Account-gated quote repost path. Plain repost functions above remain unchanged.
async function openThoughtsComposer(thoughts, postId, matchText, marker) {
  const visible=node=>{const b=node?.getBoundingClientRect?.();return !!b&&b.width>0&&b.height>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'};
  const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
  const labels=node=>[node.getAttribute('aria-label')||'',node.textContent||''].map(norm);
  const quote=value=>/repost with (?:your|my) thoughts|with your thoughts|avec (?:un commentaire|vos réflexions|mes réflexions)|ajouter (?:vos|mes) réflexions|mit (?:kommentar|.*gedanken)|con (?:tus|mis) (?:ideas|opiniones|reflexiones)|con (?:un commento|i tuoi pensieri)/i.test(value);
  const undo=value=>/undo repost|remove repost|annuler la republication|repost rückgängig|deshacer republicación|annulla ripubblicazione/i.test(value);
  // LinkedIn can wrap the real <button> in a role="button" element; count each nested pair once (keep the innermost, clickable node).
  const innermost=list=>list.filter(node=>!list.some(other=>other!==node&&node.contains?.(other)));
  const controls=innermost([...document.querySelectorAll('button,[role="button"]')].filter(visible).filter(node=>!labels(node).some(quote)&&(/repost|reshare/.test(node.getAttribute('data-view-name')||'')||labels(node).some(v=>/^(?:repost|reshare|republier|reposter|reposten|erneut teilen|volver a publicar|ripubblica|ricondividi)(?:\s|$)/i.test(v)))));
  const wanted=norm(matchText).toLowerCase().slice(0,120);
  const matching=controls.filter(button=>{
    let node=button;
    for(let depth=0;depth<14&&node;depth++,node=node.parentElement){
      const urn=(node.getAttribute?.('data-urn')||'')+' '+(node.getAttribute?.('data-id')||'');
      if(postId && /^\d+$/.test(postId) && urn.includes(postId))return true;
      const text=norm(node.innerText||node.textContent).toLowerCase();
      if(wanted && text.length<12000 && text.includes(wanted) && [...node.querySelectorAll('button,[role="button"]')].filter(c=>controls.includes(c)).length===1)return true;
    }
    return !wanted && !postId && controls.length===1;
  });
  // A permalink can expose no activity-id attribute; one visible Repost control is unambiguous.
  const button=matching.length===1?matching[0]:(!wanted&&controls.length===1?controls[0]:null);
  if(!button)return {ready:false,detail:'Could not identify exactly one matching post for Repost with your thoughts.'};
  if(button.getAttribute('aria-pressed')==='true'||labels(button).some(undo))return {ready:false,alreadyReposted:true,detail:'Post was already reposted.'};
  button.scrollIntoView({block:'center'});button.click();
  let action;
  for(let i=0;i<12&&!action;i++){await new Promise(resolve=>setTimeout(resolve,250));const matches=innermost([...document.querySelectorAll('[role="menuitem"],[role="option"],button,[role="button"]')].filter(visible).filter(n=>n!==button&&!n.contains?.(button)&&!button.contains?.(n)&&labels(n).some(quote)));if(matches.length===1)action=matches[0];}
  if(!action)return {ready:false,detail:'LinkedIn did not expose an unambiguous Repost with your thoughts option; no plain repost was used.'};
  action.click();
  let editor,root;
  for(let i=0;i<16&&!editor;i++){
    await new Promise(resolve=>setTimeout(resolve,250));
    const pairs=[...document.querySelectorAll('.ql-editor[contenteditable="true"],[contenteditable="true"][role="textbox"]')].filter(visible).map(e=>({editor:e,root:e.closest('[role="dialog"],.share-box-v2__modal,.share-box-v2__dialog')})).filter(pair=>pair.root&&visible(pair.root));
    if(pairs.length===1){editor=pairs[0].editor;root=pairs[0].root;}
  }
  if(!editor)return {ready:false,detail:'The repost composer was not found; nothing was submitted.'};
  if(norm(editor.innerText||editor.textContent)&&norm(editor.innerText||editor.textContent)!==norm(thoughts))return {ready:false,detail:'The composer already contains different text; nothing was overwritten or submitted.'};
  editor.focus();
  if(document.activeElement!==editor&&!editor.contains(document.activeElement))return {ready:false,detail:'The repost editor could not be focused.'};
  if(norm(editor.innerText||editor.textContent)!==norm(thoughts)){
    let inserted=false;try{inserted=document.execCommand('insertText',false,thoughts)}catch{}
    if(!inserted||norm(editor.innerText||editor.textContent)!==norm(thoughts)){editor.textContent=thoughts;editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:thoughts}));}
  }
  await new Promise(resolve=>setTimeout(resolve,250));
  if(norm(editor.innerText||editor.textContent)!==norm(thoughts))return {ready:false,detail:'The agreed thoughts text was not retained by LinkedIn; nothing was submitted.'};
  root.setAttribute('data-nexashare-thoughts',marker);
  return {ready:true,textVerified:true};
}

async function submitThoughtsComposer(thoughts, marker) {
  const visible=node=>{const b=node?.getBoundingClientRect?.();return !!b&&b.width>0&&b.height>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'};
  const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
  const roots=[...document.querySelectorAll('[data-nexashare-thoughts]')].filter(n=>n.getAttribute('data-nexashare-thoughts')===marker&&visible(n));
  if(roots.length!==1)return {confirmed:false,thoughtsSubmitted:false,detail:'The prepared repost composer is unavailable; nothing was submitted.'};
  const root=roots[0],editors=[...root.querySelectorAll('.ql-editor[contenteditable="true"],[contenteditable="true"][role="textbox"]')].filter(visible);
  if(editors.length!==1||norm(editors[0].innerText||editors[0].textContent)!==norm(thoughts))return {confirmed:false,thoughtsSubmitted:false,detail:'Composer text changed before submission; nothing was submitted.'};
  let submit;
  for(let i=0;i<10&&!submit;i++){
    const buttons=[...root.querySelectorAll('button,[role="button"]')].filter(visible).filter(b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true').filter(b=>b.classList.contains('share-actions__primary-action')||/^(?:Post|Publier|Posten|Veröffentlichen|Publicar|Pubblica)$/i.test(norm(b.textContent)||norm(b.getAttribute('aria-label'))));
    if(buttons.length===1)submit=buttons[0];else await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!submit)return {confirmed:false,thoughtsSubmitted:false,detail:'The prepared composer has no enabled, unambiguous Post button.'};
  const notices=()=>[...document.querySelectorAll('[role="alert"],.artdeco-toast-item')].filter(visible);
  const before=new Set(notices().map(n=>norm(n.innerText||n.textContent)));
  submit.click();
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,400));
    const notice=notices().find(n=>{const text=norm(n.innerText||n.textContent);return !before.has(text)&&/post(?:ed| successful)|your post.*(?:shared|published)|publication.*(?:réuss|publiée)|beitrag.*(?:veröffentlicht|geteilt)|publicaci[oó]n.*(?:publicada|compartida)|post.*pubblicato/i.test(text)&&!/could not|not posted|failed|error|échec|impossible|nicht|no se pudo/i.test(text)});
    if(notice&&!visible(root)){
      const link=[...notice.querySelectorAll('a[href]')].find(a=>/^https:\/\/www\.linkedin\.com\/(?:feed\/update\/|posts\/)/.test(a.href));
      return {confirmed:true,thoughtsSubmitted:true,thoughtsConfirmed:true,repostUrl:link?.href||'',detail:'LinkedIn confirmed Repost with your thoughts after the exact generated text was submitted.'};
    }
  }
  return {confirmed:false,thoughtsSubmitted:true,thoughtsConfirmed:false,detail:'LinkedIn did not provide visible confirmation after Repost with your thoughts. Do not retry until the profile is reviewed.'};
}

async function repostContentWithThoughts(post,draft) {
  let outcome={confirmed:false,thoughtsSubmitted:false,detail:'No repost was submitted.'};
  try{
    outcome=await withBackgroundTab(post.url,async tabId=>{
      const readiness=await waitForLinkedInPosts(tabId);
      if(!readiness.ready)return {confirmed:false,thoughtsSubmitted:false,detail:discoveryFailureDetail(readiness.reason)};
      const marker=crypto.randomUUID();
      const prepared=(await chrome.scripting.executeScript({target:{tabId},func:openThoughtsComposer,args:[draft.thoughts,String(post.id||''),post.inPlace?post.matchText||'':'',marker]}))?.[0]?.result;
      if(!prepared?.ready)return {confirmed:false,thoughtsSubmitted:false,detail:prepared?.detail||'The thoughts composer did not become ready.'};
      // Persist the one-time submit intent before clicking LinkedIn Post.
      await authenticatedFetch('/api/extension/repost-thoughts/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:draft.id})});
      try{return (await chrome.scripting.executeScript({target:{tabId},func:submitThoughtsComposer,args:[draft.thoughts,marker]}))?.[0]?.result||{confirmed:false,thoughtsSubmitted:true,detail:'LinkedIn did not return an outcome after thoughts submission.'};}
      catch(error){return {confirmed:false,thoughtsSubmitted:true,detail:'LinkedIn did not return an outcome after thoughts submission. '+String(error)};}
    });
  }catch(error){outcome={confirmed:false,thoughtsSubmitted:false,detail:'Thoughts repost stopped before submission. '+String(error)};}
  return {...outcome,thoughtsId:draft.id,thoughtsText:draft.thoughts};
}
