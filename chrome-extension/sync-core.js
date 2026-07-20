// =============================================================
// NexaShare — LinkedIn Content Amplifier (sync-core.js / service worker)
// Based on proven patterns from radar + social extensions.
//
// Architecture:
// 1. Fetches company list from NexaShare API
// 2. Opens company LinkedIn pages in background tabs
// 3. Injects scraper to read posts from rendered DOM
// 4. Reposts content to user's feed via native repost button
// 5. Reports results back to NexaShare API
// =============================================================

const API_BASE = 'https://nexashare.com';
const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_DELAY_MS = 2000;
const REPOST_DELAY_MS = 3000;
const PAGE_LOAD_MS = 6000;

// --- Logging (same pattern as radar) ---
const MAX_LOG_ENTRIES = 200;

async function log(level, msg, data) {
  const entry = { ts: new Date().toISOString(), level, msg, data: data !== undefined ? data : null };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[NexaShare]', msg, data !== undefined ? data : '');
  try {
    const stored = await chrome.storage.local.get('nexashareLog');
    const arr = stored.nexashareLog || [];
    arr.unshift(entry);
    await chrome.storage.local.set({ nexashareLog: arr.slice(0, MAX_LOG_ENTRIES) });
  } catch (e) {}
}

async function clearLog() {
  await chrome.storage.local.set({ nexashareLog: [] });
}

// --- Alarms (daily auto-sync, same as social v0.10.0) ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dailyRepost', { delayInMinutes: 15, periodInMinutes: 1440 });
  log('info', 'Extension installed, daily alarm set');
  chrome.action.setBadgeBackgroundColor({ color: '#0A66C2' });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'dailyRepost') {
    log('info', 'Daily alarm triggered');
    runFullSync();
  }
});

// --- Messages (same pattern as radar + social) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'syncNow') {
    runFullSync()
      .then(r => sendResponse({ ok: true, result: r }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.action === 'getLog') {
    chrome.storage.local.get('nexashareLog', d => sendResponse({ ok: true, log: d.nexashareLog || [] }));
    return true;
  }
  if (msg.action === 'clearLog') {
    clearLog().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'getStatus') {
    chrome.storage.local.get(['lastSyncResult', 'companies'], d => {
      sendResponse({ ok: true, lastSync: d.lastSyncResult || null, companies: d.companies || [] });
    });
    return true;
  }
  if (msg.action === 'setCompanies') {
    chrome.storage.local.set({ companies: msg.companies || [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.action === 'salesNavStatus') {
    chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, tabs => {
      sendResponse({ ok: tabs.length > 0 });
    });
    return true;
  }
});

// --- Main sync flow ---
async function runFullSync() {
  await clearLog();
  await log('info', 'run:start');
  setBadge('\u2026', '#6b7280');

  const loggedIn = await checkLinkedInLogin();
  await log('info', 'login-check', { loggedIn });
  if (!loggedIn) {
    await log('warn', 'Not logged into LinkedIn \u2014 open a LinkedIn tab first');
    setBadge('!', '#dc2626');
    return { status: 'not-logged-in' };
  }

  const stored = await chrome.storage.local.get('companies');
  const companies = stored.companies || [];
  await log('info', 'companies', { count: companies.length });

  if (companies.length === 0) {
    await log('warn', 'No companies configured \u2014 add company pages on nexashare.com');
    setBadge('!', '#f59e0b');
    return { status: 'no-companies' };
  }

  const results = [];
  for (const company of companies) {
    try {
      await log('info', 'company:start', { name: company.name, vanity: company.vanity });
      const posts = await scrapeCompanyPosts(company);
      await log('info', 'company:scraped', { name: company.name, postCount: posts.length });

      let reposted = 0;
      if (company.autoRepost !== false) {
        for (const post of posts) {
          if (post.alreadyReposted) continue;
          try {
            const success = await repostContent(post);
            if (success) reposted++;
            await sleep(REPOST_DELAY_MS + Math.random() * 2000);
          } catch (e) {
            await log('warn', 'repost:failed', { postId: post.id, error: String(e) });
          }
        }
      }

      await log('info', 'company:done', { name: company.name, scraped: posts.length, reposted });
      results.push({
        companyVanity: company.vanity,
        companyName: company.name,
        postsScraped: posts.length,
        postsReposted: reposted,
        posts: posts.map(p => ({
          externalPostId: p.id,
          postUrl: p.url,
          postTextSnippet: (p.text || '').slice(0, 280),
          publishedAtUtc: p.date,
          likeCount: p.likes || 0,
          commentCount: p.comments || 0,
          shareCount: p.shares || 0,
          reposted: p.alreadyReposted || false
        }))
      });
    } catch (err) {
      await log('error', 'company:error', { name: company.name, error: String(err) });
      results.push({ companyVanity: company.vanity, companyName: company.name, error: String(err) });
    }
  }

  try {
    await log('info', 'ingest:start');
    await ingestResults(results);
    await log('info', 'ingest:done');
  } catch (e) {
    await log('warn', 'ingest:failed (offline mode)', { error: String(e) });
  }

  const syncResult = {
    ts: new Date().toISOString(),
    companies: results.length,
    totalScraped: results.reduce((s, r) => s + (r.postsScraped || 0), 0),
    totalReposted: results.reduce((s, r) => s + (r.postsReposted || 0), 0),
    errors: results.filter(r => r.error).length
  };
  await chrome.storage.local.set({ lastSyncResult: syncResult });
  await log('info', 'run:done', syncResult);

  setBadge('\u2713', '#059669');
  setTimeout(() => setBadge('', ''), 3600000);
  return syncResult;
}

function checkLinkedInLogin() {
  return new Promise(resolve => {
    chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, tabs => {
      resolve(tabs.length > 0);
    });
  });
}

async function scrapeCompanyPosts(company) {
  const url = \`https://www.linkedin.com/company/\${company.vanity}/posts/?feedView=all\`;
  await log('info', 'scrape:navigate', { url });

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, tab => {
      const tabId = tab.id;
      setTimeout(async () => {
        try {
          for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: () => window.scrollBy(0, 1500)
            });
            await sleep(SCROLL_DELAY_MS);
          }
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractPostsFromDOM
          });
          chrome.tabs.remove(tabId);
          const posts = (results && results[0]) ? results[0].result || [] : [];
          resolve(posts);
        } catch (e) {
          try { chrome.tabs.remove(tabId); } catch (_) {}
          reject(e);
        }
      }, PAGE_LOAD_MS);
    });
  });
}

function extractPostsFromDOM() {
  const posts = [];
  const feedItems = document.querySelectorAll(
    '.feed-shared-update-v2, [data-urn*="activity"], .occludable-update'
  );
  feedItems.forEach(item => {
    try {
      const textEl = item.querySelector(
        '.feed-shared-text, .update-components-text, [data-test-id="main-feed-activity-card__commentary"]'
      );
      const text = textEl ? textEl.textContent.trim() : '';
      const activityLink = item.querySelector('a[href*="/feed/update/"]');
      const urn = item.getAttribute('data-urn') || '';
      const activityMatch = urn.match(/activity:(\\d+)/) ||
                           (activityLink && activityLink.href.match(/activity:(\\d+)/));
      const activityId = activityMatch ? activityMatch[1] : '';
      if (!text && !activityId) return;

      const likesEl = item.querySelector('.social-details-social-counts__reactions-count, [aria-label*="reaction"]');
      const commentsEl = item.querySelector('.social-details-social-counts__comments, [aria-label*="comment"]');
      const sharesEl = item.querySelector('[aria-label*="repost"]');
      const parseNum = el => {
        if (!el) return 0;
        const t = el.textContent.replace(/[^0-9,.]/g, '').replace(/,/g, '');
        return parseInt(t, 10) || 0;
      };

      const repostBtn = item.querySelector('button[aria-label*="Repost"], button[aria-label*="repost"]');
      const alreadyReposted = repostBtn ?
        (repostBtn.getAttribute('aria-pressed') === 'true' ||
         repostBtn.classList.contains('react-button--active')) : false;

      const timeEl = item.querySelector('time, .feed-shared-actor__sub-description');
      const timeText = timeEl ? timeEl.getAttribute('datetime') || timeEl.textContent.trim() : '';

      posts.push({
        id: activityId || 'post-' + posts.length,
        url: activityId ? \`https://www.linkedin.com/feed/update/urn:li:activity:\${activityId}/\` : '',
        text,
        date: timeText || new Date().toISOString(),
        likes: parseNum(likesEl),
        comments: parseNum(commentsEl),
        shares: parseNum(sharesEl),
        alreadyReposted
      });
    } catch (e) {}
  });
  return posts;
}

async function repostContent(post) {
  if (!post.url) return false;
  await log('info', 'repost:start', { postId: post.id, url: post.url });

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: post.url, active: false }, tab => {
      const tabId = tab.id;
      setTimeout(async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: clickRepostButton
          });
          chrome.tabs.remove(tabId);
          const success = results && results[0] && results[0].result;
          resolve(success);
        } catch (e) {
          try { chrome.tabs.remove(tabId); } catch (_) {}
          reject(e);
        }
      }, PAGE_LOAD_MS);
    });
  });
}

function clickRepostButton() {
  const btns = document.querySelectorAll('button');
  let repostBtn = null;
  for (const btn of btns) {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const text = btn.textContent.toLowerCase();
    if (label.includes('repost') || text.includes('repost')) {
      repostBtn = btn;
      break;
    }
  }
  if (!repostBtn) return false;
  if (repostBtn.getAttribute('aria-pressed') === 'true') return false;
  repostBtn.click();

  return new Promise(resolve => {
    setTimeout(() => {
      const menuItems = document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item, .social-reshare-button');
      for (const mi of menuItems) {
        const t = mi.textContent.toLowerCase();
        if (t.includes('repost') && !t.includes('with your thoughts') && !t.includes('quote')) {
          mi.click();
          resolve(true);
          return;
        }
      }
      resolve(false);
    }, 1500);
  });
}

async function ingestResults(results) {
  const stored = await chrome.storage.local.get('apiToken');
  const token = stored.apiToken || '';
  const resp = await fetch(\`\${API_BASE}/api/extension/ingest\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
    },
    body: JSON.stringify({ results })
  });
  if (!resp.ok) throw new Error(\`Ingest failed: HTTP \${resp.status}\`);
  return resp.json();
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {}
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
