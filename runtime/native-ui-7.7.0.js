(function () {
  'use strict';

  // Small compatibility layer on top of 7.6. It does not scan React or own
  // game state. It only makes the real top OVR tile unambiguous to 7.6,
  // cleans transfer badges, accelerates post-click refreshes, and makes the
  // legacy compact panel draggable when the user explicitly opens it.
  const UI_ATTR = 'data-li-v77';
  const HELPER_ATTR = 'data-li-v77-ovr-helper';
  const REAL_OVR_ATTR = 'data-li-v77-real-ovr';
  const BADGE_ATTR = 'data-li-v76-club-badge';
  const PANEL_ID = 'legionnaire-insights-panel';
  const HEADER_ID = 'legionnaire-insights-header';
  const POS_KEY = 'legionnaire-insights:compact-position-v1';
  const STYLE_ID = 'legionnaire-insights-native-v77-style';
  let lastOvrCard = null;
  let refreshNudgeTimer = null;

  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${HELPER_ATTR}]{position:absolute!important;width:1px!important;height:1px!important;left:0!important;top:0!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;font-size:1px!important;line-height:1px!important}
      [${BADGE_ATTR}]{max-width:none!important;overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important}
      #${PANEL_ID}[data-mode="compact"] #${HEADER_ID}{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
      #${PANEL_ID}[data-mode="compact"].li-v77-dragging #${HEADER_ID}{cursor:grabbing}
    `;
    document.head.appendChild(style);
  }

  function numericLeafIn(candidate) {
    let best = null;
    let bestSize = 0;
    for (const el of candidate.querySelectorAll('div,span,strong')) {
      if (el.children.length) continue;
      const text = norm(el.textContent);
      if (!/^\d{2}$/.test(text)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const size = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (size > bestSize) { best = el; bestSize = size; }
    }
    return bestSize >= 24 ? { element: best, value: Number(norm(best.textContent)), fontSize: bestSize } : null;
  }

  function findRealOvrTile() {
    const labels = [...document.querySelectorAll('div,span,p')].filter((el) =>
      el.children.length === 0 && norm(el.textContent).toUpperCase() === 'OVR'
    );
    const candidates = [];
    for (const label of labels) {
      let node = label.parentElement;
      for (let depth = 0; node && depth < 5 && node !== document.body; depth++, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 72 || rect.width > 190 || rect.height < 72 || rect.height > 190) continue;
        if (rect.bottom < 0 || rect.top > Math.min(innerHeight * 0.72, 650)) continue;
        const number = numericLeafIn(node);
        if (!number) continue;
        candidates.push({ card: node, number, rect, area: rect.width * rect.height });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const topBias = a.rect.top - b.rect.top;
      if (Math.abs(topBias) > 24) return topBias;
      const rightBias = b.rect.right - a.rect.right;
      if (Math.abs(rightBias) > 30) return rightBias;
      return a.area - b.area;
    });
    return candidates[0];
  }

  function nudgeV76Refresh(delay = 0) {
    clearTimeout(refreshNudgeTimer);
    refreshNudgeTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') document.dispatchEvent(new Event('visibilitychange'));
    }, delay);
  }

  function repairOvrTarget() {
    const found = findRealOvrTile();
    if (!found) return;
    const card = found.card;
    if (lastOvrCard && lastOvrCard !== card) {
      lastOvrCard.removeAttribute(REAL_OVR_ATTR);
      lastOvrCard.querySelector(`[${HELPER_ATTR}]`)?.remove();
    }
    lastOvrCard = card;
    card.setAttribute(REAL_OVR_ATTR, '1');
    let helper = card.querySelector(`[${HELPER_ATTR}]`);
    const wanted = ` ${found.number.value} `;
    if (!helper) {
      helper = document.createElement('span');
      helper.setAttribute(HELPER_ATTR, '1');
      helper.setAttribute(UI_ATTR, 'ovr-helper');
      helper.textContent = wanted;
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(helper);
      nudgeV76Refresh(0);
    } else if (helper.textContent !== wanted) {
      helper.textContent = wanted;
      nudgeV76Refresh(0);
    }
  }

  function cleanBadge(badge) {
    if (!(badge instanceof Element)) return;
    const match = norm(badge.textContent).match(/(\d{2,3})(?!.*\d)/);
    if (!match) return;
    const text = `OVR ${match[1]}`;
    if (badge.textContent !== text) badge.textContent = text;
    badge.title = text;
  }

  function cleanExistingBadges() {
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(cleanBadge);
  }

  function installBadgeCleaner() {
    cleanExistingBadges();
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.(`[${BADGE_ATTR}]`)) cleanBadge(node);
          node.querySelectorAll?.(`[${BADGE_ATTR}]`).forEach(cleanBadge);
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function readStoredPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
    } catch (e) { return null; }
  }

  function clampPanelPosition(panel, left, top) {
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(4, innerWidth - rect.width - 4);
    const maxTop = Math.max(4, innerHeight - rect.height - 4);
    return {
      left: Math.min(Math.max(4, left), maxLeft),
      top: Math.min(Math.max(4, top), maxTop),
    };
  }

  function applyStoredCompactPosition() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.dataset.mode !== 'compact') return;
    const saved = readStoredPosition();
    if (!saved) return;
    const pos = clampPanelPosition(panel, saved.left, saved.top);
    panel.style.setProperty('left', `${pos.left}px`, 'important');
    panel.style.setProperty('top', `${pos.top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }

  function installCompactDrag() {
    const panel = document.getElementById(PANEL_ID);
    const header = document.getElementById(HEADER_ID);
    if (!panel || !header || header.dataset.liV77Drag === '1') return;
    header.dataset.liV77Drag = '1';
    let drag = null;

    header.addEventListener('pointerdown', (event) => {
      if (panel.dataset.mode !== 'compact') return;
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest('button,a,input,select,textarea')) return;
      const rect = panel.getBoundingClientRect();
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
      panel.classList.add('li-v77-dragging');
      try { header.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const pos = clampPanelPosition(panel, drag.left + event.clientX - drag.startX, drag.top + event.clientY - drag.startY);
      panel.style.setProperty('left', `${pos.left}px`, 'important');
      panel.style.setProperty('top', `${pos.top}px`, 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
      event.preventDefault();
    });

    const finish = (event) => {
      if (!drag || (event.pointerId != null && event.pointerId !== drag.id)) return;
      drag = null;
      panel.classList.remove('li-v77-dragging');
      const rect = panel.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })); } catch (e) {}
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);

    const modeObserver = new MutationObserver(() => {
      if (panel.dataset.mode === 'compact') setTimeout(applyStoredCompactPosition, 0);
    });
    modeObserver.observe(panel, { attributes: true, attributeFilter: ['data-mode'] });
    applyStoredCompactPosition();
  }

  function installFastPostActionRefresh() {
    document.addEventListener('pointerup', (event) => {
      if (event.target instanceof Element && event.target.closest(`[${UI_ATTR}],#${PANEL_ID}`)) return;
      setTimeout(repairOvrTarget, 80);
      setTimeout(repairOvrTarget, 420);
      nudgeV76Refresh(100);
      setTimeout(() => nudgeV76Refresh(0), 520);
    }, { passive: true });
  }

  ensureStyles();
  installCompactDrag();
  installBadgeCleaner();
  installFastPostActionRefresh();
  repairOvrTarget();
  nudgeV76Refresh(0);
  window.addEventListener('load', () => { installCompactDrag(); repairOvrTarget(); nudgeV76Refresh(80); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { repairOvrTarget(); cleanExistingBadges(); applyStoredCompactPosition(); } });
  window.addEventListener('resize', () => applyStoredCompactPosition());
  setInterval(() => { repairOvrTarget(); cleanExistingBadges(); installCompactDrag(); }, 5000);
})();
