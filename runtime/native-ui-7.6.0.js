(function () {
  'use strict';

  // v7.6 keeps the frozen 7.2 sync/update core and replaces 7.5's broad DOM
  // observer with state-change driven refreshes. All injected UI is absolute
  // and out of flow so it cannot resize Legionnaire's own controls.
  const MODE_KEY = 'legionnaire-insights:mode';
  const VISIBLE_KEY = 'legionnaire-insights:native-visible-v1';
  const STYLE_ID = 'legionnaire-insights-native-v76-style';
  const QUICK_ID = 'legionnaire-insights-v76-quick';
  const SEED_ID = 'legionnaire-insights-v76-seed';
  const SEED_ENTRY_ID = 'legionnaire-insights-v76-seed-entry';
  const SEED_PREFS_KEY = 'legionnaire-insights:seed-prefs-v1';
  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';
  const UI_ATTR = 'data-li-v76';
  const BADGE_ATTR = 'data-li-v76-club-badge';
  const POT_ATTR = 'data-li-v76-pot';
  const BEST_CLASS = 'li-v76-best';
  const OVR_CLASS = 'li-v76-ovr-target';
  const SAVE_POLL_MS = 1300;
  const FALLBACK_RENDER_MS = 12000;

  let clubsByName = null;
  let clubsLoadPromise = null;
  let clubsRetryAt = 0;
  let lastSaveSignature = '';
  let refreshTimer = null;
  let lastPlayer = null;
  let seedWorker = null;
  let fallbackSeedToken = 0;

  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function isEnabled() {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function getCurrentSport() {
    try { return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football'; }
    catch (e) { return 'football'; }
  }

  function getSaveKey() {
    return getCurrentSport() === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(getSaveKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveSignature() {
    try {
      const key = getSaveKey();
      const raw = localStorage.getItem(key) || '';
      return `${key}|${raw.length}|${raw.slice(-180)}`;
    } catch (e) { return ''; }
  }

  // ---------- Creation RNG (POT is fixed for the whole career) ----------
  function sh(text) { let r = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { r ^= text.charCodeAt(i); r = Math.imul(r, 16777619); } return r >>> 0; }
  function Ks(seed) { return { seed, state: sh(seed) || 1 }; }
  function rh(state) { const s = (state + 1831565813) >>> 0; let n = s; n = Math.imul(n ^ (n >>> 15), n | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return { state: s, value: ((n ^ (n >>> 14)) >>> 0) / 4294967296 }; }
  function Zl(rng) { const n = rh(rng.state); return { rng: { seed: rng.seed, state: n.state }, value: n.value }; }
  function Xt(rng, lo, hi) { const n = Zl(rng); return { rng: n.rng, value: lo + n.value * (hi - lo) }; }
  function Ql(rng, lo, hi) { if (hi < lo) return { rng, value: lo }; const n = Zl(rng); return { rng: n.rng, value: lo + Math.floor(n.value * (hi - lo + 1)) }; }
  function Ve(rng, p) { const n = Zl(rng); return { rng: n.rng, value: n.value < p }; }
  function Mh(rng) { const n = Zl(rng); return { rng: n.rng, value: n.value < 0.1 ? 'early' : n.value < 0.2 ? 'late' : 'normal' }; }
  function Sh(rng, startingOverall) {
    const a0 = Xt(rng, 0, 1), a = a0.value;
    let p;
    if (a < 0.12) p = 62 + (a / 0.12) * 13;
    else if (a < 0.85) p = 75 + ((a - 0.12) / 0.73) * 9;
    else p = 84 + ((a - 0.85) / 0.15) * 9;
    const noise = Xt(a0.rng, -1, 1);
    return { rng: noise.rng, value: Math.max(startingOverall + 4, Math.min(96, Math.round(p + noise.value))) };
  }
  function computeCreation(seed) {
    let rng = Ks(seed);
    const elite = Ve(rng, 0.1); rng = elite.rng;
    const bounds = elite.value ? [66, 76] : [46, 52];
    const overall = Ql(rng, bounds[0], bounds[1]); rng = overall.rng;
    const profile = Mh(rng); rng = profile.rng;
    const potential = Sh(rng, overall.value);
    return { elite: elite.value, startingOverall: overall.value, developmentProfile: profile.value, potential: potential.value };
  }
  function creationFromActiveSave() {
    const save = readSave();
    if (!save || !save.seed) return null;
    try { return { ...computeCreation(String(save.seed)), seed: String(save.seed) }; }
    catch (e) { return null; }
  }

  // ---------- Club DB ----------
  async function loadClubsDb() {
    if (clubsByName) return clubsByName;
    if (clubsLoadPromise) return clubsLoadPromise;
    if (Date.now() < clubsRetryAt) return null;
    clubsLoadPromise = (async () => {
      try {
        const script = [...document.scripts].find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
        if (!script) { clubsRetryAt = Date.now() + 1500; return null; }
        const response = await fetch(script.src);
        if (!response.ok) throw new Error(String(response.status));
        const source = await response.text();
        const marker = 'JSON.parse(`';
        const byName = new Map();
        let from = 0;
        while (true) {
          const index = source.indexOf(marker, from);
          if (index === -1) break;
          const start = index + marker.length;
          const end = source.indexOf('`)', start);
          if (end === -1) break;
          from = end + 2;
          try {
            const raw = source.slice(start, end);
            const parsed = JSON.parse((0, eval)('`' + raw.replace(/`/g, '\\`') + '`'));
            if (!Array.isArray(parsed)) continue;
            for (const club of parsed) {
              let info = null;
              if (Array.isArray(club) && typeof club[0] === 'string') info = { name: club[1], tier: club[5], ovr: club[6] };
              else if (club && typeof club === 'object' && typeof club.id === 'string') info = { name: club.name, tier: club.tier, ovr: club.baseOverall };
              if (info && info.name && !byName.has(norm(info.name))) byName.set(norm(info.name), info);
            }
          } catch (e) {}
        }
        if (byName.size) clubsByName = byName;
        return clubsByName;
      } catch (e) {
        clubsRetryAt = Date.now() + 10000;
        return null;
      } finally { clubsLoadPromise = null; }
    })();
    return clubsLoadPromise;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${BADGE_ATTR}]{position:absolute!important;left:7px!important;top:7px!important;z-index:4!important;display:block!important;width:auto!important;max-width:calc(100% - 14px)!important;height:auto!important;margin:0!important;padding:3px 6px!important;border:1px solid rgba(148,163,184,.38)!important;border-radius:999px!important;background:rgba(10,13,18,.93)!important;color:#dbe3ee!important;box-sizing:border-box!important;pointer-events:none!important;white-space:nowrap!important;overflow:visible!important;font:800 9px/1.05 system-ui,-apple-system,Segoe UI,sans-serif!important;direction:ltr!important;text-align:left!important;box-shadow:0 2px 8px rgba(0,0,0,.2)!important}
      .${BEST_CLASS}{outline:2px solid rgba(74,222,128,.42)!important;outline-offset:1px!important}. ${BEST_CLASS}[${BADGE_ATTR}]{color:#86efac!important}
      [${POT_ATTR}]{position:absolute!important;left:5px!important;right:5px!important;bottom:5px!important;z-index:8!important;display:block!important;margin:0!important;padding:2px 4px!important;border-radius:999px!important;background:rgba(0,0,0,.38)!important;color:#fef08a!important;box-sizing:border-box!important;pointer-events:none!important;white-space:nowrap!important;text-align:center!important;font:850 9px/1.05 system-ui,-apple-system,Segoe UI,sans-serif!important;direction:ltr!important}
      .${OVR_CLASS}{cursor:pointer!important}
      .li-v76-overlay{position:fixed;inset:0;z-index:1000002;display:flex;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));background:rgba(0,0,0,.52)}
      .li-v76-sheet{width:min(430px,100%);max-height:min(84dvh,720px);overflow:auto;border:1px solid #3f4652;border-radius:17px;background:#0b0d12;color:#e5e7eb;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:13px;direction:rtl;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
      .li-v76-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.li-v76-title{font-size:17px;font-weight:900}.li-v76-sub{margin-top:2px;color:#9ca3af;font-size:11px;font-weight:500}.li-v76-close{width:36px;height:36px;flex:0 0 36px;border:1px solid #475569;border-radius:9px;background:#191d25;color:#e5e7eb;font-size:20px;cursor:pointer}
      .li-v76-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.li-v76-btn{min-width:0;min-height:40px;border:1px solid #475569;border-radius:10px;background:#191d25;color:#f3f4f6;padding:7px 9px;font:750 12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;white-space:normal}.li-v76-btn[data-primary="true"]{background:#4ade80;color:#06250f;border-color:#4ade80}.li-v76-btn[data-danger="true"]{color:#fca5a5}
      .li-v76-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.li-v76-field{display:flex;min-width:0;flex-direction:column;gap:4px;color:#aeb6c3;font-size:10px}.li-v76-field input,.li-v76-field select{width:100%;min-width:0;height:38px;border:1px solid #475569;border-radius:9px;background:#11151c;color:#f3f4f6;padding:0 9px;box-sizing:border-box;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}.li-v76-actions{display:flex;gap:7px}.li-v76-actions .li-v76-btn{flex:1}.li-v76-status{min-height:18px;margin:9px 1px;color:#9ca3af;font-size:11px}.li-v76-results{display:grid;gap:7px}.li-v76-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #303641;border-radius:11px;background:#11151b;padding:9px;overflow:hidden}.li-v76-result-main{min-width:0;direction:ltr;text-align:left;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}.li-v76-result-main strong{color:#facc15;font-size:14px}.li-v76-seed{margin-top:2px;color:#94a3b8;font-size:9px;overflow-wrap:anywhere}.li-v76-result .li-v76-btn{min-height:34px;padding:0 10px}
      #${SEED_ENTRY_ID}{width:100%;box-sizing:border-box;margin:8px 0 0!important;min-height:40px!important;border:1px solid rgba(74,222,128,.5)!important;border-radius:10px!important;background:rgba(10,25,16,.92)!important;color:#86efac!important;font:800 12px system-ui,-apple-system,Segoe UI,sans-serif!important;cursor:pointer!important}
      @media(min-width:700px){.li-v76-overlay{align-items:center}.li-v76-sheet{width:430px}}@media(max-width:640px){[${BADGE_ATTR}]{font-size:8px!important;padding:2px 5px!important}.li-v76-fields{grid-template-columns:1fr 1fr}.li-v76-fields .li-v76-field:last-child{grid-column:1/-1}}
    `;
    style.textContent = style.textContent.replace('. li-v76-best', '.li-v76-best');
    document.head.appendChild(style);
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }

  function ensureRelative(el) {
    if (!el || el.dataset.liV76Relative === '1') return;
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
      el.dataset.liV76Relative = '1';
    }
  }

  function restoreRelative(el) {
    if (el && el.dataset.liV76Relative === '1') {
      el.style.removeProperty('position');
      delete el.dataset.liV76Relative;
    }
  }

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
    return key ? node[key] : null;
  }

  function clickableAncestor(el) {
    let node = el;
    for (let depth = 0; node && depth < 7 && node !== document.body; depth++, node = node.parentElement) {
      if (node.matches('button,a,[role="button"]')) return node;
      const fiber = getFiber(node);
      if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps.onClick === 'function') return node;
    }
    return null;
  }

  function findOvrTile() {
    let best = null;
    let bestArea = Infinity;
    const labels = [...document.querySelectorAll('div,span')].filter((el) => el.children.length === 0 && norm(el.textContent).toUpperCase() === 'OVR');
    for (const label of labels) {
      let node = label.parentElement;
      for (let depth = 0; node && depth < 4 && node !== document.body; depth++, node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width < 70 || r.width > 170 || r.height < 70 || r.height > 170 || r.top > 700) continue;
        const nums = (norm(node.textContent).match(/\b\d{2}\b/g) || []).map(Number);
        if (!nums.length) continue;
        const area = r.width * r.height;
        if (area < bestArea) { best = { card: node, overall: nums[nums.length - 1] }; bestArea = area; }
      }
    }
    return best;
  }

  function onOvrClick() {
    if (!isEnabled()) setEnabled(true);
    openQuick();
  }

  function bindOvrTile(found, creation) {
    if (!found || !found.card) return;
    const card = found.card;
    if (!card.dataset.liV76OvrBound) {
      card.dataset.liV76OvrBound = '1';
      card.classList.add(OVR_CLASS);
      card.addEventListener('click', onOvrClick, false);
    }
    lastPlayer = creation ? { ...creation, overall: found.overall } : null;
    card.querySelector(`[${POT_ATTR}]`)?.remove();
    if (!isEnabled() || !creation) return;
    ensureRelative(card);
    const pot = document.createElement('span');
    pot.setAttribute(POT_ATTR, '1');
    pot.setAttribute(UI_ATTR, 'pot');
    pot.textContent = `POT ${creation.potential}`;
    card.appendChild(pot);
  }

  function clearClubDecorations() {
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((badge) => badge.remove());
    document.querySelectorAll(`.${BEST_CLASS}`).forEach((card) => card.classList.remove(BEST_CLASS));
    document.querySelectorAll('[data-li-v76-club-card="1"]').forEach((card) => {
      card.removeAttribute('data-li-v76-club-card');
      restoreRelative(card);
    });
  }

  function collectClubCards() {
    const out = [];
    if (!clubsByName || !clubsByName.size) return out;
    const root = document.getElementById('root') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let node = walker.nextNode();
    let guard = 0;
    while (node && guard++ < 4500) {
      const club = clubsByName.get(norm(node.nodeValue));
      if (club && node.parentElement && isVisible(node.parentElement) && !node.parentElement.closest(`[${UI_ATTR}]`)) {
        const card = clickableAncestor(node.parentElement);
        if (card && !seen.has(card)) {
          const r = card.getBoundingClientRect();
          if (r.width >= 110 && r.height >= 70 && r.bottom > 0 && r.top < innerHeight) {
            seen.add(card);
            out.push({ card, club });
          }
        }
      }
      node = walker.nextNode();
    }
    return out;
  }

  async function decorateClubs() {
    clearClubDecorations();
    if (!isEnabled()) return;
    if (!clubsByName) await loadClubsDb();
    if (!clubsByName) return;
    const targets = collectClubCards();
    if (targets.length < 2) return;
    const ovrs = targets.map((x) => Number(x.club.ovr)).filter(Number.isFinite);
    const bestOvr = ovrs.length ? Math.max(...ovrs) : null;
    for (const { card, club } of targets) {
      ensureRelative(card);
      card.setAttribute('data-li-v76-club-card', '1');
      const best = bestOvr != null && Number(club.ovr) === bestOvr;
      if (best) card.classList.add(BEST_CLASS);
      const badge = document.createElement('span');
      badge.setAttribute(BADGE_ATTR, '1');
      badge.setAttribute(UI_ATTR, 'club-badge');
      const tier = club.tier != null ? `T${club.tier}` : '';
      const ovr = club.ovr != null ? String(club.ovr) : '';
      badge.textContent = [tier, ovr].filter(Boolean).join(' · ');
      badge.title = [tier, club.ovr != null ? `OVR ${club.ovr}` : ''].filter(Boolean).join(' · ');
      if (best) badge.style.color = '#86efac';
      card.appendChild(badge);
    }
  }

  function hideCoreLauncher() {
    const launcher = document.getElementById('legionnaire-insights-reopen');
    if (launcher) launcher.style.display = 'none';
    if (!isEnabled()) document.getElementById('legionnaire-insights-panel')?.style.setProperty('display', 'none');
  }

  function openCorePanel(tab) {
    const panel = document.getElementById('legionnaire-insights-panel');
    const launcher = document.getElementById('legionnaire-insights-reopen');
    if (!panel || !launcher) return;
    let mode = 'hidden';
    try { mode = localStorage.getItem(MODE_KEY) || 'hidden'; } catch (e) {}
    if (mode === 'hidden') launcher.click();
    setTimeout(() => {
      const current = document.getElementById('legionnaire-insights-panel');
      if (!current) return;
      const full = [...current.querySelectorAll('button')].find((b) => b.title === 'Full mode');
      if (full) full.click();
      setTimeout(() => current.querySelector(`.li-tab[data-tab="${tab}"]`)?.click(), 0);
    }, 0);
  }

  function profileLabel(p) { return ({ early: 'מוקדמת', normal: 'רגילה', late: 'מאוחרת' })[p] || norm(p); }
  function closeQuick() { document.getElementById(QUICK_ID)?.remove(); }

  function openQuick() {
    closeQuick();
    const player = lastPlayer;
    const gap = player && Number.isFinite(Number(player.overall)) ? Number(player.potential) - Number(player.overall) : null;
    const sub = player ? `POT ${player.potential}${gap == null ? '' : ` · ${gap >= 0 ? '+' : ''}${gap}`} · ${profileLabel(player.developmentProfile)}` : 'Legionnaire Insights';
    const overlay = document.createElement('div');
    overlay.id = QUICK_ID;
    overlay.className = 'li-v76-overlay';
    overlay.setAttribute(UI_ATTR, 'quick');
    overlay.innerHTML = `<div class="li-v76-sheet" role="dialog" aria-modal="true"><div class="li-v76-head"><div><div class="li-v76-title">Legionnaire Insights</div><div class="li-v76-sub">${sub}</div></div><button class="li-v76-close" type="button" data-close>×</button></div><div class="li-v76-grid"><button class="li-v76-btn" type="button" data-action="details">פרטים</button><button class="li-v76-btn" type="button" data-primary="true" data-action="seed">מצא סיד</button><button class="li-v76-btn" type="button" data-action="tools">כלים / Sync</button><button class="li-v76-btn" type="button" data-danger="true" data-action="hide">הסתר LI</button></div></div>`;
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

  function setEnabled(enabled) {
    try { localStorage.setItem(VISIBLE_KEY, enabled ? '1' : '0'); localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
    hideCoreLauncher();
    if (!enabled) {
      closeQuick();
      closeSeed();
      clearClubDecorations();
      document.querySelectorAll(`[${POT_ATTR}]`).forEach((el) => el.remove());
    }
    scheduleRefresh(0);
  }

  function readSeedPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(SEED_PREFS_KEY) || '{}');
      return { potential: Number(p.potential) || 94, overall: Number(p.overall) || 76, profile: ['any','early','normal','late'].includes(p.profile) ? p.profile : 'normal' };
    } catch (e) { return { potential: 94, overall: 76, profile: 'normal' }; }
  }
  function saveSeedPrefs(p) { try { localStorage.setItem(SEED_PREFS_KEY, JSON.stringify(p)); } catch (e) {} }

  function applySeed(seed) {
    const sport = getCurrentSport();
    const key = sport === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
    let template = { lastName: 'Player', number: 10, foot: 'right', position: 'ST', cadence: 'intense' };
    if (sport === 'basketball') template.height = 190;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const e = JSON.parse(raw);
        template = { lastName: e.lastName ?? template.lastName, number: e.number ?? template.number, foot: e.foot ?? template.foot, position: e.position ?? template.position, cadence: e.cadence ?? template.cadence };
        if (sport === 'basketball') template.height = e.height ?? template.height;
      }
      localStorage.setItem(key, JSON.stringify({ ...template, seed, choices: [] }));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }

  function stopSeedSearch() {
    fallbackSeedToken++;
    if (seedWorker) { try { seedWorker.terminate(); } catch (e) {} seedWorker = null; }
  }
  function closeSeed() { stopSeedSearch(); document.getElementById(SEED_ID)?.remove(); }

  function appendSeedResult(container, seed, r) {
    const row = document.createElement('div');
    row.className = 'li-v76-result';
    row.setAttribute(UI_ATTR, 'seed-result');
    row.innerHTML = `<div class="li-v76-result-main"><strong>POT ${r.potential}</strong> · OVR ${r.startingOverall} · ${r.developmentProfile}${r.elite ? ' ★elite' : ''}<div class="li-v76-seed">${seed}</div></div><button class="li-v76-btn" data-primary="true" type="button">השתמש</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (!confirm('להתחיל קריירה חדשה עם הסיד הזה? הקריירה הפעילה תוחלף.')) return;
      applySeed(seed);
    });
    container.appendChild(row);
  }

  function workerSource() {
    return `function sh(t){let r=2166136261>>>0;for(let i=0;i<t.length;i++){r^=t.charCodeAt(i);r=Math.imul(r,16777619)}return r>>>0}function K(s){return{seed:s,state:sh(s)||1}}function R(s){const x=(s+1831565813)>>>0;let n=x;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return{state:x,value:((n^(n>>>14))>>>0)/4294967296}}function Z(r){const n=R(r.state);return{rng:{seed:r.seed,state:n.state},value:n.value}}function X(r,l,h){const n=Z(r);return{rng:n.rng,value:l+n.value*(h-l)}}function Q(r,l,h){const n=Z(r);return{rng:n.rng,value:l+Math.floor(n.value*(h-l+1))}}function V(r,p){const n=Z(r);return{rng:n.rng,value:n.value<p}}function M(r){const n=Z(r);return{rng:n.rng,value:n.value<.1?'early':n.value<.2?'late':'normal'}}function S(r,o){const a=X(r,0,1),v=a.value;let p;if(v<.12)p=62+(v/.12)*13;else if(v<.85)p=75+((v-.12)/.73)*9;else p=84+((v-.85)/.15)*9;const n=X(a.rng,-1,1);return{value:Math.max(o+4,Math.min(96,Math.round(p+n.value)))}}function C(seed){let r=K(seed);const e=V(r,.1);r=e.rng;const b=e.value?[66,76]:[46,52];const o=Q(r,b[0],b[1]);r=o.rng;const p=M(r);r=p.rng;const pot=S(r,o.value);return{elite:e.value,startingOverall:o.value,developmentProfile:p.value,potential:pot.value}}function G(){const c='abcdefghijklmnopqrstuvwxyz0123456789',p=n=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');return p(8)+'-'+p(8)}onmessage=e=>{const q=e.data;let t=0,f=0;while(t<500000&&f<8){const seed=G(),r=C(seed);t++;if(r.potential===q.potential&&r.startingOverall===q.overall&&(q.profile==='any'||r.developmentProfile===q.profile)){f++;postMessage({type:'result',seed,result:r,tries:t,found:f})}if(t%25000===0)postMessage({type:'progress',tries:t,found:f})}postMessage({type:'done',tries:t,found:f})}`;
  }

  function createSeedWorker() {
    try {
      const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
      const worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return worker;
    } catch (e) { return null; }
  }

  function runFallbackSearch(q, modal) {
    const token = ++fallbackSeedToken;
    const status = modal.querySelector('[data-status]');
    const results = modal.querySelector('[data-results]');
    let tries = 0, found = 0;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const seed = () => { const p = (n) => Array.from({ length:n }, () => chars[Math.floor(Math.random()*chars.length)]).join(''); return `${p(8)}-${p(8)}`; };
    function chunk(deadline) {
      if (token !== fallbackSeedToken || !document.body.contains(modal)) return;
      let count = 0;
      while (tries < 500000 && found < 8 && count++ < 600 && (!deadline || deadline.timeRemaining() > 2)) {
        const s = seed(), r = computeCreation(s); tries++;
        if (r.potential === q.potential && r.startingOverall === q.overall && (q.profile === 'any' || r.developmentProfile === q.profile)) { found++; appendSeedResult(results, s, r); }
      }
      status.textContent = `נבדקו ${tries.toLocaleString()} · נמצאו ${found}`;
      if (tries >= 500000 || found >= 8) return;
      if (typeof requestIdleCallback === 'function') requestIdleCallback(chunk, { timeout: 150 }); else setTimeout(() => chunk(null), 30);
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(chunk, { timeout: 150 }); else setTimeout(() => chunk(null), 30);
  }

  function runSeedSearch(modal) {
    stopSeedSearch();
    const q = { potential: Number(modal.querySelector('[data-pot]').value) || 94, overall: Number(modal.querySelector('[data-ovr]').value) || 76, profile: modal.querySelector('[data-profile]').value };
    saveSeedPrefs(q);
    const status = modal.querySelector('[data-status]');
    const results = modal.querySelector('[data-results]');
    results.innerHTML = ''; status.textContent = 'מחפש…';
    const worker = createSeedWorker();
    if (!worker) { runFallbackSearch(q, modal); return; }
    seedWorker = worker;
    worker.onmessage = (event) => {
      const m = event.data || {};
      if (!document.body.contains(modal)) { stopSeedSearch(); return; }
      if (m.type === 'result') appendSeedResult(results, m.seed, m.result);
      if (m.type === 'result' || m.type === 'progress') status.textContent = `נבדקו ${Number(m.tries||0).toLocaleString()} · נמצאו ${m.found||0}`;
      if (m.type === 'done') { status.textContent = `הסתיים · נבדקו ${Number(m.tries||0).toLocaleString()} · נמצאו ${m.found||0}`; stopSeedSearch(); }
    };
    worker.onerror = () => { stopSeedSearch(); runFallbackSearch(q, modal); };
    worker.postMessage(q);
  }

  function openSeed() {
    closeSeed();
    const p = readSeedPrefs();
    const overlay = document.createElement('div');
    overlay.id = SEED_ID; overlay.className = 'li-v76-overlay'; overlay.setAttribute(UI_ATTR, 'seed');
    overlay.innerHTML = `<div class="li-v76-sheet"><div class="li-v76-head"><div><div class="li-v76-title">מציאת סיד</div><div class="li-v76-sub">החיפוש רץ ב-Worker כשאפשר.</div></div><button class="li-v76-close" type="button" data-close>×</button></div><div class="li-v76-fields"><label class="li-v76-field">Potential<input data-pot type="number" min="50" max="96" value="${p.potential}"></label><label class="li-v76-field">Starting OVR<input data-ovr type="number" min="40" max="90" value="${p.overall}"></label><label class="li-v76-field">Development<select data-profile><option value="any">כל פרופיל</option><option value="early">early</option><option value="normal">normal</option><option value="late">late</option></select></label></div><div class="li-v76-actions"><button class="li-v76-btn" data-primary="true" type="button" data-search>חפש סידים</button><button class="li-v76-btn" type="button" data-stop>עצור</button></div><div class="li-v76-status" data-status>בחר ערכים ולחץ חיפוש.</div><div class="li-v76-results" data-results></div></div>`;
    overlay.querySelector('[data-profile]').value = p.profile;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) closeSeed();
      if (event.target.closest('[data-search]')) runSeedSearch(overlay);
      if (event.target.closest('[data-stop]')) { stopSeedSearch(); overlay.querySelector('[data-status]').textContent = 'החיפוש נעצר.'; }
    });
    document.body.appendChild(overlay);
  }

  function findCareerStartButton() {
    const labels = ['קריירה חדשה','התחל קריירה חדשה','התחל קריירה','שחקן חדש'];
    for (const button of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(button) || button.closest(`[${UI_ATTR}]`)) continue;
      const text = norm(button.textContent);
      if (labels.some((label) => text === label || text.includes(label))) return button;
    }
    return null;
  }

  function ensureSeedEntry() {
    const existing = document.getElementById(SEED_ENTRY_ID);
    if (!isEnabled() || creationFromActiveSave()) { existing?.remove(); return; }
    const start = findCareerStartButton();
    if (!start || !start.parentElement) { existing?.remove(); return; }
    let button = existing;
    if (!button) {
      button = document.createElement('button');
      button.id = SEED_ENTRY_ID; button.type = 'button'; button.setAttribute(UI_ATTR, 'seed-entry'); button.textContent = '✨ מצא סיד לקריירה חדשה';
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openSeed(); });
    }
    if (button.parentElement !== start.parentElement) start.insertAdjacentElement('afterend', button);
  }

  async function refresh() {
    refreshTimer = null;
    if (document.visibilityState === 'hidden') return;
    hideCoreLauncher();
    const creation = creationFromActiveSave();
    const found = findOvrTile();
    if (found) bindOvrTile(found, creation);
    else lastPlayer = creation ? { ...creation, overall: null } : null;
    if (isEnabled()) {
      await decorateClubs();
      ensureSeedEntry();
    } else {
      clearClubDecorations();
      document.getElementById(SEED_ENTRY_ID)?.remove();
    }
  }

  function scheduleRefresh(delay = 0) {
    if (refreshTimer || document.visibilityState === 'hidden') return;
    refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, delay);
  }

  function installCheapRefreshes() {
    lastSaveSignature = saveSignature();
    setInterval(() => {
      const sig = saveSignature();
      if (sig !== lastSaveSignature) { lastSaveSignature = sig; scheduleRefresh(180); }
    }, SAVE_POLL_MS);
    setInterval(() => { if (document.visibilityState === 'visible') scheduleRefresh(0); }, FALLBACK_RENDER_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleRefresh(120); });
    window.addEventListener('keydown', (event) => {
      if (event.altKey && String(event.key).toLowerCase() === 'l') { const next = !isEnabled(); setEnabled(next); if (next) setTimeout(openQuick, 0); }
    });
  }

  ensureStyles();
  try { localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
  hideCoreLauncher();
  installCheapRefreshes();
  loadClubsDb().then(() => scheduleRefresh(0));
  scheduleRefresh(0);
})();
