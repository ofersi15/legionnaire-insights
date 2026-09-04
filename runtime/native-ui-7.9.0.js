(function () {
  'use strict';

  const MODE_KEY = 'legionnaire-insights:mode';
  const VISIBLE_KEY = 'legionnaire-insights:native-visible-v1';
  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';
  const HUD_POS_KEY = 'legionnaire-insights:hud-position-v3';
  const COMPACT_POS_KEY = 'legionnaire-insights:compact-position-v3';
  const CLUB_CACHE_KEY = 'legionnaire-insights:club-cache-v1';
  const SEED_PREFS_KEY = 'legionnaire-insights:seed-prefs-v1';
  const HUD_ID = 'legionnaire-insights-v79-hud';
  const QUICK_ID = 'legionnaire-insights-v79-quick';
  const SEED_ID = 'legionnaire-insights-v79-seed';
  const BADGE_ATTR = 'data-li-v79-club-badge';
  const CARD_ATTR = 'data-li-v79-club-card';
  const UI_ATTR = 'data-li-v79';
  const BEST_CLASS = 'li-v79-best';
  const STYLE_ID = 'legionnaire-insights-native-v79-style';

  let clubByName = null;
  let clubSource = '';
  let decorateTimers = [];
  let seedWorker = null;
  let seedToken = 0;

  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function enabled() {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function sport() {
    try { return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football'; }
    catch (e) { return 'football'; }
  }

  function saveKey() {
    return sport() === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(saveKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---------- fixed creation POT ----------
  function sh(text) { let r = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { r ^= text.charCodeAt(i); r = Math.imul(r, 16777619); } return r >>> 0; }
  function Ks(seed) { return { seed, state: sh(seed) || 1 }; }
  function rh(state) { const s = (state + 1831565813) >>> 0; let n = s; n = Math.imul(n ^ (n >>> 15), n | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return { state: s, value: ((n ^ (n >>> 14)) >>> 0) / 4294967296 }; }
  function Zl(rng) { const n = rh(rng.state); return { rng: { seed: rng.seed, state: n.state }, value: n.value }; }
  function Xt(rng, lo, hi) { const n = Zl(rng); return { rng: n.rng, value: lo + n.value * (hi - lo) }; }
  function Ql(rng, lo, hi) { const n = Zl(rng); return { rng: n.rng, value: lo + Math.floor(n.value * (hi - lo + 1)) }; }
  function Ve(rng, p) { const n = Zl(rng); return { rng: n.rng, value: n.value < p }; }
  function Mh(rng) { const n = Zl(rng); return { rng: n.rng, value: n.value < 0.1 ? 'early' : n.value < 0.2 ? 'late' : 'normal' }; }
  function Sh(rng, overall) {
    const a0 = Xt(rng, 0, 1), a = a0.value;
    let p;
    if (a < 0.12) p = 62 + (a / 0.12) * 13;
    else if (a < 0.85) p = 75 + ((a - 0.12) / 0.73) * 9;
    else p = 84 + ((a - 0.85) / 0.15) * 9;
    const noise = Xt(a0.rng, -1, 1);
    return Math.max(overall + 4, Math.min(96, Math.round(p + noise.value)));
  }
  function creation(seed) {
    let rng = Ks(seed);
    const elite = Ve(rng, 0.1); rng = elite.rng;
    const bounds = elite.value ? [66, 76] : [46, 52];
    const overall = Ql(rng, bounds[0], bounds[1]); rng = overall.rng;
    const profile = Mh(rng); rng = profile.rng;
    return { startingOverall: overall.value, developmentProfile: profile.value, potential: Sh(rng, overall.value), elite: elite.value };
  }
  function currentCreation() {
    const save = readSave();
    if (!save || !save.seed) return null;
    try { return creation(String(save.seed)); }
    catch (e) { return null; }
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const r = element.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return false;
    const s = getComputedStyle(element);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }

  // A stale active-save key can remain on the home/new-career screen. Only
  // expose POT when the actual career player card is on screen.
  function careerUiVisible() {
    for (const el of document.querySelectorAll('div,span')) {
      if (el.children.length || !visible(el)) continue;
      if (norm(el.textContent).toUpperCase() === 'OVR') return true;
    }
    return false;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #legionnaire-insights-reopen{display:none!important}
      #${HUD_ID}{position:fixed;z-index:1000000;display:inline-flex;align-items:center;gap:5px;min-height:31px;padding:5px 9px;border:1px solid rgba(74,222,128,.5);border-radius:999px;background:rgba(7,10,14,.92);color:#e5e7eb;box-shadow:0 4px 14px rgba(0,0,0,.28);backdrop-filter:blur(8px);font:850 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;direction:ltr;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
      #${HUD_ID} b{color:#4ade80;font:900 10px ui-monospace,SFMono-Regular,Consolas,monospace}#${HUD_ID} strong{color:#facc15;font-size:12px}
      #${HUD_ID}.li-v79-dragging{cursor:grabbing;opacity:.9}
      [${BADGE_ATTR}]{position:absolute!important;left:7px!important;top:7px!important;z-index:5!important;display:block!important;width:auto!important;height:auto!important;margin:0!important;padding:3px 6px!important;border:1px solid rgba(148,163,184,.4)!important;border-radius:999px!important;background:rgba(10,13,18,.94)!important;color:#dbe3ee!important;box-sizing:border-box!important;pointer-events:none!important;white-space:nowrap!important;font:850 9px/1.05 system-ui,-apple-system,Segoe UI,sans-serif!important;direction:ltr!important;text-align:left!important;box-shadow:0 2px 8px rgba(0,0,0,.2)!important}
      .${BEST_CLASS}{outline:2px solid rgba(74,222,128,.45)!important;outline-offset:1px!important}.${BEST_CLASS} [${BADGE_ATTR}]{color:#86efac!important;border-color:rgba(74,222,128,.5)!important}
      .li-v79-overlay{position:fixed;inset:0;z-index:1000002;display:flex;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));background:rgba(0,0,0,.52)}
      .li-v79-sheet{width:min(430px,100%);max-height:min(84dvh,720px);overflow:auto;border:1px solid #3f4652;border-radius:17px;background:#0b0d12;color:#e5e7eb;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:13px;direction:rtl;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
      .li-v79-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.li-v79-title{font-size:17px;font-weight:900}.li-v79-sub{margin-top:2px;color:#9ca3af;font-size:11px;font-weight:500}.li-v79-close{width:36px;height:36px;flex:0 0 36px;border:1px solid #475569;border-radius:9px;background:#191d25;color:#e5e7eb;font-size:20px}
      .li-v79-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.li-v79-btn{min-width:0;min-height:40px;border:1px solid #475569;border-radius:10px;background:#191d25;color:#f3f4f6;padding:7px 9px;font:750 12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;white-space:normal}.li-v79-btn[data-primary="true"]{background:#4ade80;color:#06250f;border-color:#4ade80}.li-v79-btn[data-danger="true"]{color:#fca5a5}
      .li-v79-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.li-v79-field{display:flex;min-width:0;flex-direction:column;gap:4px;color:#aeb6c3;font-size:10px}.li-v79-field input,.li-v79-field select{width:100%;min-width:0;height:38px;border:1px solid #475569;border-radius:9px;background:#11151c;color:#f3f4f6;padding:0 9px;box-sizing:border-box;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}.li-v79-actions{display:flex;gap:7px}.li-v79-actions .li-v79-btn{flex:1}.li-v79-status{min-height:18px;margin:9px 1px;color:#9ca3af;font-size:11px}.li-v79-results{display:grid;gap:7px}.li-v79-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #303641;border-radius:11px;background:#11151b;padding:9px}.li-v79-result-main{min-width:0;direction:ltr;text-align:left;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}.li-v79-result-main strong{color:#facc15;font-size:14px}.li-v79-seed{font-size:9px;color:#94a3b8;overflow-wrap:anywhere}
      #legionnaire-insights-panel[data-mode="compact"]{position:fixed!important;right:auto!important;bottom:auto!important;z-index:1000001!important;max-width:calc(100vw - 12px)!important;max-height:calc(100dvh - 12px)!important}
      #legionnaire-insights-panel[data-mode="compact"] #legionnaire-insights-header,#legionnaire-insights-panel[data-mode="compact"] .li-header{cursor:grab!important;touch-action:none!important;user-select:none!important;-webkit-user-select:none!important}
      @media(min-width:700px){.li-v79-overlay{align-items:center}}@media(max-width:640px){[${BADGE_ATTR}]{font-size:8px!important;padding:2px 5px!important}.li-v79-fields{grid-template-columns:1fr 1fr}.li-v79-fields .li-v79-field:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function readPos(key) {
    try { const p = JSON.parse(localStorage.getItem(key) || 'null'); return p && Number.isFinite(p.left) && Number.isFinite(p.top) ? p : null; }
    catch (e) { return null; }
  }
  function writePos(key, left, top) { try { localStorage.setItem(key, JSON.stringify({ left: Math.round(left), top: Math.round(top) })); } catch (e) {} }
  function clamp(el, left, top) {
    const r = el.getBoundingClientRect();
    return { left: Math.min(Math.max(4, left), Math.max(4, innerWidth - r.width - 4)), top: Math.min(Math.max(4, top), Math.max(4, innerHeight - r.height - 4)) };
  }
  function defaultHudPos(el) {
    const mobile = matchMedia('(max-width: 640px)').matches;
    return clamp(el, mobile ? 20 : 12, mobile ? 62 : 12);
  }

  function makeDraggable(el, key, handle) {
    if (!el || el.dataset.liV79Drag === '1') return;
    el.dataset.liV79Drag = '1';
    const h = handle || el;
    let drag = null;
    let suppressClick = false;

    h.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      const r = el.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
      suppressClick = false;
      try { h.setPointerCapture(event.pointerId); } catch (e) {}
    });
    h.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 12) drag.moved = true;
      if (!drag.moved) return;
      const p = clamp(el, drag.left + dx, drag.top + dy);
      el.classList.add('li-v79-dragging');
      el.style.setProperty('left', `${p.left}px`, 'important');
      el.style.setProperty('top', `${p.top}px`, 'important');
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      event.preventDefault();
    });
    const finish = (event) => {
      if (!drag || (event.pointerId != null && drag.id !== event.pointerId)) return;
      suppressClick = drag.moved;
      if (drag.moved) {
        const r = el.getBoundingClientRect();
        writePos(key, r.left, r.top);
        event.preventDefault();
      }
      drag = null;
      el.classList.remove('li-v79-dragging');
    };
    h.addEventListener('pointerup', finish);
    h.addEventListener('pointercancel', finish);
    el.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function setEnabled(value) {
    try {
      localStorage.setItem(VISIBLE_KEY, value ? '1' : '0');
      localStorage.setItem(MODE_KEY, 'hidden');
    } catch (e) {}
    closeQuick();
    closeSeed();
    clearClubBadges();
    syncHud();
  }

  function syncHud() {
    const existing = document.getElementById(HUD_ID);
    const showPot = enabled() && careerUiVisible();
    const c = showPot ? currentCreation() : null;
    const textKey = !enabled() ? 'restore' : c ? `pot:${c.potential}` : 'plain';

    if (existing && existing.dataset.liState === textKey) return;
    existing?.remove();

    const hud = document.createElement('button');
    hud.id = HUD_ID;
    hud.type = 'button';
    hud.setAttribute(UI_ATTR, 'hud');
    hud.dataset.liState = textKey;
    hud.innerHTML = c ? `<b>LI</b><span>POT <strong>${c.potential}</strong></span>` : '<b>LI</b>';
    if (!enabled()) hud.style.opacity = '.55';
    document.body.appendChild(hud);

    const saved = readPos(HUD_POS_KEY);
    const p = saved ? clamp(hud, saved.left, saved.top) : defaultHudPos(hud);
    hud.style.setProperty('left', `${p.left}px`, 'important');
    hud.style.setProperty('top', `${p.top}px`, 'important');
    makeDraggable(hud, HUD_POS_KEY, hud);

    hud.addEventListener('click', () => {
      if (!enabled()) setEnabled(true);
      openQuick();
    });
  }

  // ---------- club cache / fast OVR badges ----------
  function loadCachedClubs() {
    try {
      const cache = JSON.parse(localStorage.getItem(CLUB_CACHE_KEY) || 'null');
      if (!cache || !Array.isArray(cache.items)) return;
      clubByName = new Map(cache.items);
      clubSource = cache.src || '';
    } catch (e) {}
  }

  async function refreshClubCache() {
    const script = [...document.scripts].find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
    if (!script || (clubByName && clubSource === script.src)) return;
    try {
      const response = await fetch(script.src);
      if (!response.ok) return;
      const source = await response.text();
      const marker = 'JSON.parse(`';
      const map = new Map();
      let from = 0;
      while (true) {
        const i = source.indexOf(marker, from);
        if (i === -1) break;
        const start = i + marker.length, end = source.indexOf('`)', start);
        if (end === -1) break;
        from = end + 2;
        try {
          const parsed = JSON.parse((0, eval)('`' + source.slice(start, end).replace(/`/g, '\\`') + '`'));
          if (!Array.isArray(parsed)) continue;
          for (const row of parsed) {
            let name, ovr;
            if (Array.isArray(row) && typeof row[0] === 'string') { name = row[1]; ovr = row[6]; }
            else if (row && typeof row === 'object' && typeof row.id === 'string') { name = row.name; ovr = row.baseOverall; }
            const n = norm(name);
            if (n && Number.isFinite(Number(ovr)) && !map.has(n)) map.set(n, Number(ovr));
          }
        } catch (e) {}
      }
      if (map.size) {
        clubByName = map;
        clubSource = script.src;
        try { localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify({ src: script.src, items: [...map.entries()] })); } catch (e) {}
        scheduleDecorateBurst();
      }
    } catch (e) {}
  }

  function ensureRelative(el) {
    if (getComputedStyle(el).position === 'static' && el.dataset.liV79Relative !== '1') {
      el.style.position = 'relative';
      el.dataset.liV79Relative = '1';
    }
  }
  function clearClubBadges() {
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((x) => x.remove());
    document.querySelectorAll(`[${CARD_ATTR}]`).forEach((card) => {
      card.removeAttribute(CARD_ATTR);
      card.classList.remove(BEST_CLASS);
      if (card.dataset.liV79Relative === '1') {
        card.style.removeProperty('position');
        delete card.dataset.liV79Relative;
      }
    });
  }
  function clubOvrInCard(card) {
    if (!clubByName) return null;
    for (const el of card.querySelectorAll('div,span,strong,h2,h3,h4,p')) {
      if (el.children.length) continue;
      const ovr = clubByName.get(norm(el.textContent));
      if (Number.isFinite(ovr)) return ovr;
    }
    return null;
  }
  function decorateClubs() {
    clearClubBadges();
    if (!enabled() || !clubByName || !clubByName.size) return;
    const found = [];
    for (const card of document.querySelectorAll('button,[role="button"]')) {
      if (!visible(card) || card.closest(`[${UI_ATTR}],#legionnaire-insights-panel`)) continue;
      const r = card.getBoundingClientRect();
      if (r.width < 105 || r.height < 65) continue;
      const ovr = clubOvrInCard(card);
      if (!Number.isFinite(ovr)) continue;
      found.push({ card, ovr });
    }
    if (found.length < 2) return;
    const best = Math.max(...found.map((x) => x.ovr));
    for (const { card, ovr } of found) {
      ensureRelative(card);
      card.setAttribute(CARD_ATTR, '1');
      if (ovr === best) card.classList.add(BEST_CLASS);
      const badge = document.createElement('span');
      badge.setAttribute(BADGE_ATTR, '1');
      badge.setAttribute(UI_ATTR, 'badge');
      badge.textContent = `OVR ${ovr}`;
      card.appendChild(badge);
    }
  }
  function scheduleDecorateBurst() {
    decorateTimers.forEach(clearTimeout);
    decorateTimers = [];
    for (const delay of [0, 70, 200, 500]) decorateTimers.push(setTimeout(decorateClubs, delay));
  }

  // ---------- menus ----------
  function closeQuick() { document.getElementById(QUICK_ID)?.remove(); }
  function closeSeed() { stopSeed(); document.getElementById(SEED_ID)?.remove(); }
  function hideCoreLauncher() { const x = document.getElementById('legionnaire-insights-reopen'); if (x) x.style.display = 'none'; }

  function openCorePanel(tab) {
    const panel = document.getElementById('legionnaire-insights-panel');
    const launcher = document.getElementById('legionnaire-insights-reopen');
    if (!panel || !launcher) return;
    let mode = 'hidden';
    try { mode = localStorage.getItem(MODE_KEY) || 'hidden'; } catch (e) {}
    if (mode === 'hidden') launcher.click();
    setTimeout(() => {
      const p = document.getElementById('legionnaire-insights-panel');
      if (!p) return;
      const full = [...p.querySelectorAll('button')].find((b) => b.title === 'Full mode');
      if (full) full.click();
      setTimeout(() => p.querySelector(`.li-tab[data-tab="${tab}"]`)?.click(), 0);
    }, 0);
  }

  function openQuick() {
    closeQuick();
    const inCareer = careerUiVisible();
    const c = inCareer ? currentCreation() : null;
    const overlay = document.createElement('div');
    overlay.id = QUICK_ID;
    overlay.className = 'li-v79-overlay';
    overlay.setAttribute(UI_ATTR, 'quick');
    overlay.innerHTML = `<div class="li-v79-sheet"><div class="li-v79-head"><div><div class="li-v79-title">Legionnaire Insights</div><div class="li-v79-sub">${c ? `POT ${c.potential} · ${c.developmentProfile}` : 'אין קריירה פעילה'}</div></div><button class="li-v79-close" type="button" data-close>×</button></div><div class="li-v79-grid"><button class="li-v79-btn" type="button" data-action="details">פרטים</button><button class="li-v79-btn" data-primary="true" type="button" data-action="seed">מצא סיד</button><button class="li-v79-btn" type="button" data-action="tools">כלים / Sync</button><button class="li-v79-btn" data-danger="true" type="button" data-action="hide">הסתר LI</button></div></div>`;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) closeQuick();
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'details') { closeQuick(); openCorePanel('now'); }
      if (action === 'tools') { closeQuick(); openCorePanel('tools'); }
      if (action === 'seed') { closeQuick(); openSeed(); }
      if (action === 'hide') setEnabled(false);
    });
    document.body.appendChild(overlay);
  }

  // ---------- seed finder ----------
  function readSeedPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(SEED_PREFS_KEY) || '{}');
      return { potential: Number(p.potential) || 94, overall: Number(p.overall) || 76, profile: ['any', 'early', 'normal', 'late'].includes(p.profile) ? p.profile : 'normal' };
    } catch (e) { return { potential: 94, overall: 76, profile: 'normal' }; }
  }
  function stopSeed() { seedToken++; if (seedWorker) { try { seedWorker.terminate(); } catch (e) {} seedWorker = null; } }
  function applySeed(seed) {
    const key = saveKey();
    let template = { lastName: 'Player', number: 10, foot: 'right', position: 'ST', cadence: 'intense' };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const e = JSON.parse(raw);
        template = { ...template, lastName: e.lastName ?? template.lastName, number: e.number ?? template.number, foot: e.foot ?? template.foot, position: e.position ?? template.position, cadence: e.cadence ?? template.cadence };
      }
      localStorage.setItem(key, JSON.stringify({ ...template, seed, choices: [] }));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }
  function workerText() { return `function h(t){let r=2166136261>>>0;for(let i=0;i<t.length;i++){r^=t.charCodeAt(i);r=Math.imul(r,16777619)}return r>>>0}function k(s){return{seed:s,state:h(s)||1}}function z(r){const s=(r.state+1831565813)>>>0;let n=s;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return{rng:{seed:r.seed,state:s},value:((n^(n>>>14))>>>0)/4294967296}}function x(r,l,h){const n=z(r);return{rng:n.rng,value:l+n.value*(h-l)}}function q(r,l,h){const n=z(r);return{rng:n.rng,value:l+Math.floor(n.value*(h-l+1))}}function v(r,p){const n=z(r);return{rng:n.rng,value:n.value<p}}function m(r){const n=z(r);return{rng:n.rng,value:n.value<.1?'early':n.value<.2?'late':'normal'}}function c(seed){let r=k(seed);const e=v(r,.1);r=e.rng;const b=e.value?[66,76]:[46,52];const o=q(r,b[0],b[1]);r=o.rng;const p=m(r);r=p.rng;const a=x(r,0,1),A=a.value;let pot;if(A<.12)pot=62+(A/.12)*13;else if(A<.85)pot=75+((A-.12)/.73)*9;else pot=84+((A-.85)/.15)*9;const no=x(a.rng,-1,1);pot=Math.max(o.value+4,Math.min(96,Math.round(pot+no.value)));return{elite:e.value,startingOverall:o.value,developmentProfile:p.value,potential:pot}}function g(){const c='abcdefghijklmnopqrstuvwxyz0123456789',p=n=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');return p(8)+'-'+p(8)}onmessage=e=>{const a=e.data;let t=0,f=0;while(t<500000&&f<8){const s=g(),r=c(s);t++;if(r.potential===a.potential&&r.startingOverall===a.overall&&(a.profile==='any'||r.developmentProfile===a.profile)){f++;postMessage({type:'result',seed:s,result:r,tries:t,found:f})}if(t%25000===0)postMessage({type:'progress',tries:t,found:f})}postMessage({type:'done',tries:t,found:f})}`; }
  function appendSeed(container, seed, r) {
    const row = document.createElement('div');
    row.className = 'li-v79-result';
    row.innerHTML = `<div class="li-v79-result-main"><strong>POT ${r.potential}</strong> · OVR ${r.startingOverall} · ${r.developmentProfile}<div class="li-v79-seed">${seed}</div></div><button class="li-v79-btn" data-primary="true" type="button">השתמש</button>`;
    row.querySelector('button').onclick = () => { if (confirm('להתחיל קריירה חדשה עם הסיד הזה? הקריירה הפעילה תוחלף.')) applySeed(seed); };
    container.appendChild(row);
  }
  function runSeed(modal) {
    stopSeed();
    const query = { potential: Number(modal.querySelector('[data-pot]').value) || 94, overall: Number(modal.querySelector('[data-ovr]').value) || 76, profile: modal.querySelector('[data-profile]').value };
    try { localStorage.setItem(SEED_PREFS_KEY, JSON.stringify(query)); } catch (e) {}
    const status = modal.querySelector('[data-status]'), results = modal.querySelector('[data-results]');
    results.innerHTML = '';
    status.textContent = 'מחפש…';
    try {
      const url = URL.createObjectURL(new Blob([workerText()], { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      seedWorker = worker;
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'result') appendSeed(results, m.seed, m.result);
        if (m.type === 'result' || m.type === 'progress') status.textContent = `נבדקו ${Number(m.tries || 0).toLocaleString()} · נמצאו ${m.found || 0}`;
        if (m.type === 'done') { status.textContent = `הסתיים · נמצאו ${m.found || 0}`; stopSeed(); }
      };
      worker.postMessage(query);
    } catch (e) { status.textContent = 'Worker לא זמין בדפדפן הזה.'; }
  }
  function openSeed() {
    closeSeed();
    const p = readSeedPrefs(), overlay = document.createElement('div');
    overlay.id = SEED_ID;
    overlay.className = 'li-v79-overlay';
    overlay.setAttribute(UI_ATTR, 'seed');
    overlay.innerHTML = `<div class="li-v79-sheet"><div class="li-v79-head"><div><div class="li-v79-title">מציאת סיד</div><div class="li-v79-sub">החיפוש רץ ב-Worker ולא על ה-thread של המשחק.</div></div><button class="li-v79-close" data-close>×</button></div><div class="li-v79-fields"><label class="li-v79-field">Potential<input data-pot type="number" value="${p.potential}"></label><label class="li-v79-field">Starting OVR<input data-ovr type="number" value="${p.overall}"></label><label class="li-v79-field">Development<select data-profile><option value="any">כל פרופיל</option><option value="early">early</option><option value="normal">normal</option><option value="late">late</option></select></label></div><div class="li-v79-actions"><button class="li-v79-btn" data-primary="true" data-search>חפש</button><button class="li-v79-btn" data-stop>עצור</button></div><div class="li-v79-status" data-status>בחר ערכים ולחץ חיפוש.</div><div class="li-v79-results" data-results></div></div>`;
    overlay.querySelector('[data-profile]').value = p.profile;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) closeSeed();
      if (e.target.closest('[data-search]')) runSeed(overlay);
      if (e.target.closest('[data-stop]')) { stopSeed(); overlay.querySelector('[data-status]').textContent = 'נעצר.'; }
    });
    document.body.appendChild(overlay);
  }

  // ---------- compact core panel drag ----------
  function installCompactDrag() {
    const panel = document.getElementById('legionnaire-insights-panel');
    if (!panel || panel.dataset.mode !== 'compact') return;
    const handle = panel.querySelector('#legionnaire-insights-header,.li-header') || panel.firstElementChild;
    if (!handle) return;
    const saved = readPos(COMPACT_POS_KEY);
    if (saved && panel.dataset.liV79PositionApplied !== '1') {
      panel.dataset.liV79PositionApplied = '1';
      const p = clamp(panel, saved.left, saved.top);
      panel.style.setProperty('left', `${p.left}px`, 'important');
      panel.style.setProperty('top', `${p.top}px`, 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
    }
    makeDraggable(panel, COMPACT_POS_KEY, handle);
  }

  function afterInteraction(event) {
    if (event.target instanceof Element && event.target.closest(`[${UI_ATTR}]`)) return;
    syncHud();
    scheduleDecorateBurst();
    setTimeout(installCompactDrag, 0);
  }

  ensureStyles();
  try { localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
  hideCoreLauncher();
  loadCachedClubs();
  syncHud();
  scheduleDecorateBurst();

  // Build/refresh the cache only after startup work has settled. Cached data
  // remains immediately available on normal subsequent launches.
  const refreshCache = () => refreshClubCache();
  if (typeof requestIdleCallback === 'function') requestIdleCallback(refreshCache, { timeout: 4000 });
  else setTimeout(refreshCache, 1800);

  document.addEventListener('pointerup', afterInteraction, { passive: true });
  document.addEventListener('keyup', afterInteraction, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncHud();
      scheduleDecorateBurst();
      installCompactDrag();
    }
  });
  window.addEventListener('resize', () => {
    const hud = document.getElementById(HUD_ID);
    if (hud) {
      const r = hud.getBoundingClientRect();
      const p = clamp(hud, r.left, r.top);
      hud.style.setProperty('left', `${p.left}px`, 'important');
      hud.style.setProperty('top', `${p.top}px`, 'important');
    }
    installCompactDrag();
  });

  // Short startup burst only; no continuous native-UI polling.
  for (const delay of [120, 400, 900, 1600]) setTimeout(() => { syncHud(); decorateClubs(); installCompactDrag(); }, delay);
})();
