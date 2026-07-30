// =============================================================
// NexaShare content script — injected into nexashare.com
// Bridge between the NexaShare web app and the extension.
// Same pattern as radar's content.js: announces presence via
// data attributes + CustomEvents, relays messages between
// the page and the service worker.
// =============================================================
(function () {
  try {
    var V = chrome.runtime.getManifest().version;
    var root = document.documentElement;

    function announce(linkedInOk) {
      root.setAttribute('data-nexashare-ext', V);
      if (linkedInOk !== undefined) {
        root.setAttribute('data-nexashare-linkedin', linkedInOk ? '1' : '0');
      }
      window.dispatchEvent(new CustomEvent('nexashare-ext-ready', {
        detail: { version: V, linkedIn: linkedInOk === undefined ? null : linkedInOk }
      }));
    }

    function queryAndAnnounce() {
      announce();
      try {
        chrome.runtime.sendMessage({ action: 'salesNavStatus' }, function (resp) {
          if (chrome.runtime.lastError) return;
          announce(!!(resp && resp.ok));
        });
      } catch (e) {}
    }

    queryAndAnnounce();
    window.addEventListener('nexashare-ext-ping', queryAndAnnounce);

    window.addEventListener('nexashare-ext-sync', function () {
      try {
        chrome.runtime.sendMessage({ action: 'syncNow' }, function (resp) {
          var detail;
          if (chrome.runtime.lastError) {
            detail = { ok: false, error: chrome.runtime.lastError.message };
          } else if (!resp || !resp.ok) {
            detail = { ok: false, error: (resp && resp.error) || 'unknown' };
          } else {
            detail = { ok: true, result: resp.result || {} };
          }
          window.dispatchEvent(new CustomEvent('nexashare-ext-sync-result', { detail: detail }));
        });
      } catch (e) {
        window.dispatchEvent(new CustomEvent('nexashare-ext-sync-result', {
          detail: { ok: false, error: String(e) }
        }));
      }
    });

    window.addEventListener('nexashare-ext-get-status', function () {
      try {
        chrome.runtime.sendMessage({ action: 'getStatus' }, function (resp) {
          var detail = (!chrome.runtime.lastError && resp && resp.ok)
            ? { ok: true, connected: !!resp.connected, lastSync: resp.lastSync, companies: resp.companies }
            : { ok: false };
          window.dispatchEvent(new CustomEvent('nexashare-ext-status', { detail: detail }));
        });
      } catch (e) {
        window.dispatchEvent(new CustomEvent('nexashare-ext-status', { detail: { ok: false } }));
      }
    });

    window.addEventListener('nexashare-ext-set-companies', function (ev) {
      try {
        var companies = (ev && ev.detail && ev.detail.companies) || [];
        chrome.runtime.sendMessage({ action: 'setCompanies', companies: companies }, function (resp) {
          var detail = (!chrome.runtime.lastError && resp && resp.ok)
            ? { ok: true }
            : { ok: false, error: (resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) };
          window.dispatchEvent(new CustomEvent('nexashare-ext-companies-saved', { detail: detail }));
        });
      } catch (e) {
        window.dispatchEvent(new CustomEvent('nexashare-ext-companies-saved', {
          detail: { ok: false, error: String(e) }
        }));
      }
    });

    window.addEventListener('nexashare-ext-configure', function (ev) {
      try {
        var detail = (ev && ev.detail) || {};
        chrome.runtime.sendMessage({
          action: 'configure',
          apiToken: detail.apiToken || '',
          apiBase: detail.apiBase || ''
        }, function (resp) {
          window.dispatchEvent(new CustomEvent('nexashare-ext-configured', {
            detail: (!chrome.runtime.lastError && resp && resp.ok)
              ? { ok: true }
              : { ok: false, error: (resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) }
          }));
        });
      } catch (e) {
        window.dispatchEvent(new CustomEvent('nexashare-ext-configured', { detail: { ok: false, error: String(e) } }));
      }
    });

    window.addEventListener('nexashare-ext-get-log', function () {
      try {
        chrome.runtime.sendMessage({ action: 'getLog' }, function (resp) {
          var detail = (!chrome.runtime.lastError && resp && resp.ok)
            ? { ok: true, log: resp.log }
            : { ok: false };
          window.dispatchEvent(new CustomEvent('nexashare-ext-log', { detail: detail }));
        });
      } catch (e) {
        window.dispatchEvent(new CustomEvent('nexashare-ext-log', { detail: { ok: false } }));
      }
    });

  } catch (e) {}
})();
