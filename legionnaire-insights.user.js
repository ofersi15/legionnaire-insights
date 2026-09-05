// ==UserScript==
// @name         Legionnaire Insights
// @namespace    legionnaire-insights
// @version      8.2.4
// @description  Seed outcome previews, responsive Legionnaire UI, club strength, seed tools and sparse conflict-safe cloud sync.
// @match        https://www.legionnaire.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/legionnaire-insights-8.2.4.js
// @homepageURL  https://github.com/ofersi15/legionnaire-insights
// @source       https://github.com/ofersi15/legionnaire-insights
// @updateURL    https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// @downloadURL  https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// ==/UserScript==

// V8 intentionally loads one runtime only. Legacy 7.x core/UI/performance
// patches remain in repository history but are not executed by the install.
// The wrapper contains only small compatibility bridges: Tampermonkey update
// handoff and bounded recovery for unusually late/single-club decision cards.

(function () {
  'use strict';

  const UPDATE_URL = 'https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js';
  const CLUB_BADGE_SELECTOR = '[data-li-v8-club-badge]';
  const CLUB_CARD_SELECTOR = '[data-li-v8-club-card]';
  const CLUB_CACHE_KEY = 'legionnaire-insights:club-cache-v4';
  let latestPromise = null;
  let lateClubTimer = 0;
  let finalClubTimer = 0;

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

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }

  function cachedClubAliases() {
    try {
      const cache = JSON.parse(localStorage.getItem(CLUB_CACHE_KEY) || 'null');
      if (!cache || !Array.isArray(cache.items)) return null;
      const activeSport = localStorage.getItem('maslul-kariera:sport:v1') === 'basketball'
        ? 'basketball'
        : 'football';
      const activeItems = cache.items.filter((item) => item && item.sport === activeSport);
      const aliases = new Map();
      for (const item of activeItems) {
        if (!item || !Number.isFinite(Number(item.ovr))) continue;
        const key = norm(item.name);
        if (key) aliases.set(key, item);
      }
      for (const item of activeItems) {
        if (!item || !Number.isFinite(Number(item.ovr))) continue;
        for (const raw of [item.shortName, ...(item.aliases || [])]) {
          const key = norm(raw);
          if (key && !aliases.has(key)) aliases.set(key, item);
        }
      }
      return aliases.size ? aliases : null;
    } catch (e) {
      return null;
    }
  }

  // Runtime v8 intentionally treats 2+ club cards as a comparison set. On the
  // end-of-cycle screen there can be exactly one club offer next to Retirement;
  // annotate that single club from the already-cached DB without declaring it
  // "best" or introducing any observer/poller.
  function decorateSingleClubFallback() {
    if (document.querySelector(CLUB_BADGE_SELECTOR)) return false;
    const aliases = cachedClubAliases();
    if (!aliases) return false;

    const matches = [];
    for (const card of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(card) || card.closest('[data-li-v8]')) continue;
      const r = card.getBoundingClientRect();
      if (r.width < 105 || r.height < 65) continue;
      let club = null;
      for (const el of card.querySelectorAll('div,span,strong,h2,h3,h4,p')) {
        if (el.children.length || el.closest('[data-li-v8]')) continue;
        club = aliases.get(norm(el.textContent));
        if (club) break;
      }
      if (club) matches.push({ card, club });
    }

    if (matches.length !== 1) return false;
    const { card, club } = matches[0];
    if (getComputedStyle(card).position === 'static') {
      card.style.position = 'relative';
      card.dataset.liV8Relative = '1';
    }
    card.setAttribute('data-li-v8-club-card', '1');
    card.classList.remove('li-v8-best');
    let badge = card.querySelector(':scope > [data-li-v8-club-badge]');
    if (!badge) {
      badge = document.createElement('span');
      badge.setAttribute('data-li-v8-club-badge', '1');
      badge.setAttribute('data-li-v8', 'badge');
      card.appendChild(badge);
    }
    badge.textContent = `OVR ${Number(club.ovr)}`;
    return true;
  }

  function kickLateClubRefresh() {
    if (!document.querySelector(CLUB_BADGE_SELECTOR)) {
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Unidentified',
        code: 'Unidentified',
        bubbles: false,
        cancelable: false,
      }));
    }
    setTimeout(decorateSingleClubFallback, 120);
  }

  function armLateClubRefresh() {
    clearTimeout(lateClubTimer);
    clearTimeout(finalClubTimer);
    lateClubTimer = setTimeout(() => {
      kickLateClubRefresh();
      finalClubTimer = setTimeout(kickLateClubRefresh, 3000);
    }, 2700);
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
      setTimeout(() => enhanceUpdateButton(true), 80);
    }
  }, true);

  document.addEventListener('pointerup', (event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('[data-li-v8]')) return;
    armLateClubRefresh();
  }, { passive: true });

  // Cover direct load/resume and the one-club end-of-cycle screen.
  armLateClubRefresh();
  setTimeout(decorateSingleClubFallback, 1800);
})();
