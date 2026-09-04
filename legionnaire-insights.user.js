// ==UserScript==
// @name         Legionnaire Insights
// @namespace    legionnaire-insights
// @version      8.0.2
// @description  Lightweight event-driven Legionnaire HUD, reliable career detection, club strength, seed tools and sparse conflict-safe cloud sync.
// @match        https://www.legionnaire.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/legionnaire-insights-8.0.1.js
// @homepageURL  https://github.com/ofersi15/legionnaire-insights
// @source       https://github.com/ofersi15/legionnaire-insights
// @updateURL    https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// @downloadURL  https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// ==/UserScript==

// V8 intentionally loads one runtime only. Legacy 7.x core/UI/performance
// patches remain in repository history but are not executed by the install.
// This tiny wrapper bridge turns the existing "check update" control into an
// installer link when a newer userscript version is available. The actual
// feature/runtime logic remains in the single @require above.

(function () {
  'use strict';

  const UPDATE_URL = 'https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js';
  let latestPromise = null;

  function currentVersion() {
    return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '0.0.0';
  }

  function compareVersions(a, b) {
    const x = String(a).split('.').map((n) => Number(n) || 0);
    const y = String(b).split('.').map((n) => Number(n) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    }
    return 0;
  }

  function fetchLatest(force = false) {
    if (!force && latestPromise) return latestPromise;
    latestPromise = new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${UPDATE_URL}?li_check=${Date.now()}`,
        timeout: 15000,
        onload: (res) => {
          const match = res.status >= 200 && res.status < 300
            ? res.responseText.match(/^\/\/ @version\s+([^\s]+)$/m)
            : null;
          resolve(match ? match[1] : '');
        },
        onerror: () => resolve(''),
        ontimeout: () => resolve(''),
      });
    });
    return latestPromise;
  }

  function statusText(text) {
    const el = document.querySelector('#legionnaire-insights-v8-sheet [data-status]');
    if (el) el.textContent = text;
  }

  async function enhanceUpdateButton(force = false) {
    const button = document.querySelector('#legionnaire-insights-v8-sheet [data-update]');
    if (!button) return;
    const latest = await fetchLatest(force);
    if (!button.isConnected || !latest) return;
    if (compareVersions(latest, currentVersion()) > 0) {
      button.textContent = `עדכן ל-${latest}`;
      button.dataset.liInstallVersion = latest;
      button.setAttribute('data-primary', '1');
      statusText(`גרסה ${latest} זמינה. לחיצה על כפתור העדכון תפתח את מסך העדכון של Tampermonkey.`);
    } else {
      delete button.dataset.liInstallVersion;
      button.removeAttribute('data-primary');
      button.textContent = 'בדוק עדכון';
    }
  }

  function openInstaller(version) {
    const url = `${UPDATE_URL}?li_install=${encodeURIComponent(version || Date.now())}`;
    const opened = window.open(url, '_blank');
    if (!opened) location.assign(url);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const installButton = target.closest('#legionnaire-insights-v8-sheet [data-update][data-li-install-version]');
    if (installButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openInstaller(installButton.dataset.liInstallVersion);
      return;
    }

    if (target.closest('[data-action="sync"]')) {
      setTimeout(() => enhanceUpdateButton(false), 0);
      return;
    }

    if (target.closest('#legionnaire-insights-v8-sheet [data-update]')) {
      // Let the runtime perform its normal check/status update, then promote
      // the same button to an install action if the fetched version is newer.
      setTimeout(() => enhanceUpdateButton(true), 80);
    }
  }, true);
})();
