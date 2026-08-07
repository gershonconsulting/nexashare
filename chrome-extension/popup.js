// NexaShare popup — talks to sync-core.js service worker via messages.
// Same pattern as radar's popup.js.

const installedVersion = chrome.runtime.getManifest().version;
document.getElementById('ver').textContent = 'Version ' + installedVersion;

const statusEl = document.getElementById('status');
const lastEl = document.getElementById('last-sync');
const companiesEl = document.getElementById('companies');

function show(msg, kind) {
  statusEl.innerHTML = '<div class="status ' + kind + '">' + msg + '</div>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function relTime(ts) {
  if (!ts) return '';
  var m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

// --- Render companies list ---
function renderCompanies() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, function (resp) {
    if (chrome.runtime.lastError || !resp || !resp.ok) {
      companiesEl.innerHTML = '<div style="font-size:11px;color:#9ca3af;">Could not load</div>';
      return;
    }

    var companies = resp.companies || [];
    if (companies.length === 0) {
      companiesEl.innerHTML = '<div style="font-size:11px;color:#9ca3af;">No companies configured. Open the dashboard to add one.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      var statusClass = c.enabled !== 0 ? 'on' : 'off';
      var statusText = c.enabled !== 0 ? 'Ready' : 'Paused';
      html += '<div class="company-item">' +
        '<span class="company-name">' + escapeHtml(c.name || c.vanity) + '</span>' +
        '<span class="company-status ' + statusClass + '">' + statusText + '</span>' +
        '</div>';
    }
    companiesEl.innerHTML = html;

    // Render last sync
    if (resp.lastSync) {
      var ls = resp.lastSync;
      lastEl.innerHTML = 'Last sync ' + relTime(ls.ts) +
        ' \u00b7 ' + (ls.totalScraped || 0) + ' posts found' +
        ' \u00b7 ' + (ls.totalConfirmed || 0) + ' confirmed' +
        ' \u00b7 ' + (ls.totalFailed || 0) + ' failed';
    }
  });
}

// --- Render log ---
function renderLog() {
  chrome.runtime.sendMessage({ action: 'getLog' }, function (resp) {
    if (chrome.runtime.lastError || !resp || !resp.ok) return;
    var logArr = resp.log || [];
    if (!logArr.length) return;

    var done = logArr.find(function (e) { return e.msg === 'run:done'; });
    var start = logArr[logArr.length - 1];
    var head = '';
    if (done) {
      head = 'Last run ' + relTime(start && start.ts) +
        ' \u00b7 ' + (done.data && done.data.totalScraped || 0) + ' scraped' +
        ' \u00b7 ' + (done.data && done.data.totalConfirmed || 0) + ' confirmed' +
        ' \u00b7 ' + (done.data && done.data.totalFailed || 0) + ' failed';
    } else {
      head = 'Last run ' + relTime(start && start.ts);
    }

    var html = head +
      '<details style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:8px;">' +
      '<summary style="cursor:pointer;font-size:11px;color:#0A66C2;">View log (' + logArr.length + ' steps)</summary>' +
      '<div style="margin-top:6px;max-height:240px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:10px;line-height:1.4;background:#f9fafb;padding:6px;border-radius:4px;">';
    for (var i = 0; i < logArr.length; i++) {
      var ev = logArr[i];
      var t = (ev.ts || '').slice(11, 19);
      var color = ev.level === 'error' ? '#dc2626' : (ev.msg === 'run:done' ? '#059669' : '#374151');
      html += '<div style="margin-bottom:4px;"><span style="color:#9ca3af;">' + t + '</span> ' +
        '<strong style="color:' + color + ';">' + escapeHtml(ev.msg) + '</strong>';
      if (ev.data) html += '<div style="margin-left:12px;color:#6b7280;">' + escapeHtml(JSON.stringify(ev.data)) + '</div>';
      html += '</div>';
    }
    html += '</div></details>';
    lastEl.innerHTML = html;
  });
}

// --- Sync Now button ---
document.getElementById('sync-now').addEventListener('click', function (e) {
  var btn = e.currentTarget;
  btn.disabled = true;
  show('Sync running. LinkedIn tabs will open while NexaShare checks and acts\u2026', 'info');

  chrome.runtime.sendMessage({ action: 'syncNow' }, function (response) {
    btn.disabled = false;
    if (chrome.runtime.lastError) {
      show('Sync failed: ' + chrome.runtime.lastError.message, 'err');
      renderLog();
      return;
    }
    if (!response || !response.ok) {
      show('Sync error: ' + ((response && response.error) || 'unknown'), 'err');
      renderLog();
      return;
    }

    var r = response.result || {};
    if (r.status === 'not-logged-in') {
      show('Open a LinkedIn tab first, then try again.', 'err');
    } else if (r.status === 'no-companies') {
      show('No companies configured. Open the dashboard to add one.', 'err');
    } else if (r.status === 'not-connected') {
      show('Connect this extension from the NexaShare dashboard first.', 'err');
    } else if (r.status === 'reporting-failed') {
      show('Run finished, but outcomes could not be saved. Reconnect from the dashboard.', 'err');
    } else if (r.status === 'paused') {
      show('Automatic reposting is paused for every company. Resume a company in the dashboard.', 'info');
    } else if (r.totalFailed) {
      show('Run complete: ' + (r.totalConfirmed || 0) + ' confirmed, ' + r.totalFailed + ' not confirmed. See the log.', 'err');
    } else {
      show('\u2713 Run complete \u2014 ' + (r.totalConfirmed || 0) + ' reposts confirmed by LinkedIn', 'ok');
    }
    renderLog();
    renderCompanies();
  });
});

// --- Manage companies ---
document.getElementById('add-btn').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://nexashare.com/dashboard.html' });
});

// Initial render
renderCompanies();
renderLog();
