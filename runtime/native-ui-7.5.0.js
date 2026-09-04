(function () {
  'use strict';

  // v7.5 replaces the stacked 7.3 + 7.4 UI runtimes. The sync/update core is
  // still loaded separately and remains untouched. Native UI no longer walks
  // the full React tree on an interval: it derives POT/profile from the save
  // seed, reads the visible OVR card, and annotates only clickable club cards.
  const MODE_KEY = 'legionnaire-insights:mode';
  const VISIBLE_KEY = 'legionnaire-insights:native-visible-v1';
  const STYLE_ID = 'legionnaire-insights-native-v75-style';
  const QUICK_ID = 'legionnaire-insights-v75-quick';
  const SEED_ID = 'legionnaire-insights-v75-seed';
  const SEED_ENTRY_ID = 'legionnaire-insights-v75-seed-entry';
  const SEED_PREFS_KEY = 'legionnaire-insights:seed-prefs-v1';
  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';
  const CARD_CLASS = 'li-v75-club-card';
  const BEST_CLASS = 'li-v75-best';
  const OVR_CLASS = 'li-v75-ovr';
  const META_ATTR = 'data-li-club-meta';
  const POT_ATTR = 'data-li-pot';
  const UI_ATTR = 'data-li-v75';
  const RENDER_MIN_MS = 500;
  const SAVE_POLL_MS = 900;
  const FALLBACK_RENDER_MS = 6000;

  let lastPlayer = null;
  let lastRenderAt = 0;
  let renderTimer = null;
  let lastSaveSignature = '';
  let clubsById = null;
  let clubsByName = null;
  let clubsLoadPromise = null;
  let clubsRetryAt = 0;
  let seedWorker = null;
  let fallbackSeedToken = 0;

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isEnabled() {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function setEnabled(enabled) {
    try { localStorage.setItem(VISIBLE_KEY, enabled ? '1' : '0'); } catch (e) {}
    try { localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
    hideCoreLauncher();
    if (!enabled) {
      closeQuick();
      closeSeed();
      clearPresentation();
      return;
    }
    scheduleRender(0);
  }

  function getCurrentSport() {
    try { return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football'; }
    catch (e) { return 'football'; }
  }

  function getSaveKey() {
    return getCurrentSport() === 'basketball'
      ? 'maslul-kariera:basketball:save:v2'
      : 'maslul-kariera:football:save:v2';
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(getSaveKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getSaveSignature() {
    try {
      const key = getSaveKey();
      const raw = localStorage.getItem(key) || '';
      return `${key}|${raw.length}|${raw.slice(-140)}`;
    } catch (e) {
      return '';
    }
  }

  function sh(text) {
    let result = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      result ^= text.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }
  function Ks(seed) { return { seed, state: sh(seed) || 1 }; }
  function rh(state) {
    const nextState = (state + 1831565813) >>> 0;
    let n = nextState;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return { state: nextState, value: ((n ^ (n >>> 14)) >>> 0) / 4294967296 };
  }
  function Zl(rng) { const result = rh(rng.state); return { rng: { seed: rng.seed, state: result.state }, value: result.value }; }
  function Xt(rng, lo, hi) { const next = Zl(rng); return { rng: next.rng, value: lo + next.value * (hi - lo) }; }
  function Ql(rng, lo, hi) { if (hi < lo) return { rng, value: lo }; const next = Zl(rng); return { rng: next.rng, value: lo + Math.floor(next.value * (hi - lo + 1)) }; }
  function Ve(rng, probability) { const next = Zl(rng); return { rng: next.rng, value: next.value < probability }; }
  function Mh(rng) { const next = Zl(rng); return { rng: next.rng, value: next.value < 0.1 ? 'early' : next.value < 0.2 ? 'late' : 'normal' }; }
  function Sh(rng, startingOverall) {
    const first = Xt(rng, 0, 1);
    const a = first.value;
    let potential;
    if (a < 0.12) potential = 62 + (a / 0.12) * 13;
    else if (a < 0.85) potential = 75 + ((a - 0.12) / 0.73) * 9;
    else potential = 84 + ((a - 0.85) / 0.15) * 9;
    const noise = Xt(first.rng, -1, 1);
    return { rng: noise.rng, value: Math.max(startingOverall + 4, Math.min(96, Math.round(potential + noise.value))) };
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

  async function loadClubsDb() {
    if (clubsById) return clubsById;
    if (clubsLoadPromise) return clubsLoadPromise;
    if (Date.now() < clubsRetryAt) return null;

    clubsLoadPromise = (async () => {
      try {
        const scriptTag = [...document.scripts].find((script) => /\/assets\/index-[^/]+\.js/.test(script.src));
        if (!scriptTag) {
          clubsRetryAt = Date.now() + 1500;
          return null;
        }
        const response = await fetch(scriptTag.src);
        if (!response.ok) throw new Error(String(response.status));
        const source = await response.text();
        const marker = 'JSON.parse(`';
        const map = new Map();
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
              let id = null;
              if (Array.isArray(club) && typeof club[0] === 'string') {
                id = club[0];
                info = { name: club[1], league: club[4], tier: club[5], ovr: club[6] };
              } else if (club && typeof club === 'object' && typeof club.id === 'string') {
                id = club.id;
                info = { name: club.name, league: club.league, tier: club.tier, ovr: club.baseOverall };
              }
              if (!id || !info || !info.name) continue;
              map.set(id, info);
              const key = norm(info.name);
              if (key && !byName.has(key)) byName.set(key, info);
            }
          } catch (e) {}
        }

        if (map.size) {
          clubsById = map;
          clubsByName = byName;
        }
        return clubsById;
      } catch (e) {
        clubsRetryAt = Date.now() + 10000;
        return null;
      } finally {
        clubsLoadPromise = null;
      }
    })();

    return clubsLoadPromise;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${CARD_CLASS}[${META_ATTR}]::after{content:attr(${META_ATTR});position:absolute;inset-inline-start:7px;top:7px;z-index:3;max-width:45%;padding:3px 6px;border:1px solid rgba(148,163,184,.34);border-radius:999px;background:rgba(12,15,21,.9);color:#d5dbe5;box-sizing:border-box;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:800 9px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;direction:ltr;text-align:left;box-shadow:0 2px 8px rgba(0,0,0,.18)}
      .${BEST_CLASS}[${META_ATTR}]::after{color:#86efac;border-color:rgba(74,222,128,.5)}.${BEST_CLASS}{outline:2px solid rgba(74,222,128,.42);outline-offset:1px}
      .${OVR_CLASS}{cursor:pointer}.${OVR_CLASS}[${POT_ATTR}]::after{content:attr(${POT_ATTR});position:absolute;left:50%;bottom:5px;transform:translateX(-50%);z-index:3;max-width:92%;padding:2px 5px;border-radius:999px;background:rgba(0,0,0,.32);color:#fef08a;box-sizing:border-box;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:850 8px/1.05 system-ui,-apple-system,Segoe UI,sans-serif;direction:ltr}
      .li-v75-overlay{position:fixed;inset:0;z-index:1000002;display:flex;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));background:rgba(0,0,0,.52)}
      .li-v75-sheet{width:min(430px,100%);max-height:min(84dvh,720px);overflow:auto;border:1px solid #3f4652;border-radius:17px;background:#0b0d12;color:#e5e7eb;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:13px;direction:rtl;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
      .li-v75-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.li-v75-title{font-size:17px;font-weight:900}.li-v75-sub{margin-top:2px;color:#9ca3af;font-size:11px;font-weight:500}.li-v75-close{width:36px;height:36px;flex:0 0 36px;border:1px solid #475569;border-radius:9px;background:#191d25;color:#e5e7eb;font-size:20px;cursor:pointer}
      .li-v75-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.li-v75-btn{min-width:0;min-height:40px;border:1px solid #475569;border-radius:10px;background:#191d25;color:#f3f4f6;padding:7px 9px;font:750 12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;white-space:normal}.li-v75-btn[data-primary="true"]{background:#4ade80;color:#06250f;border-color:#4ade80}.li-v75-btn[data-danger="true"]{color:#fca5a5}
      .li-v75-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.li-v75-field{display:flex;min-width:0;flex-direction:column;gap:4px;color:#aeb6c3;font-size:10px}.li-v75-field input,.li-v75-field select{width:100%;min-width:0;height:38px;border:1px solid #475569;border-radius:9px;background:#11151c;color:#f3f4f6;padding:0 9px;box-sizing:border-box;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}
      .li-v75-actions{display:flex;gap:7px}.li-v75-actions .li-v75-btn{flex:1}.li-v75-status{min-height:18px;margin:9px 1px;color:#9ca3af;font-size:11px}.li-v75-results{display:grid;gap:7px}.li-v75-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #303641;border-radius:11px;background:#11151b;padding:9px;overflow:hidden}.li-v75-result-main{min-width:0;direction:ltr;text-align:left;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}.li-v75-result-main strong{color:#facc15;font-size:14px}.li-v75-seed{margin-top:2px;color:#94a3b8;font-size:9px;overflow-wrap:anywhere}.li-v75-result .li-v75-btn{min-height:34px;padding:0 10px}
      #${SEED_ENTRY_ID}{width:100%;box-sizing:border-box;margin:8px 0 0!important;min-height:40px!important;border:1px solid rgba(74,222,128,.5)!important;border-radius:10px!important;background:rgba(10,25,16,.92)!important;color:#86efac!important;font:800 12px system-ui,-apple-system,Segoe UI,sans-serif!important;cursor:pointer!important}
      @media(min-width:700px){.li-v75-overlay{align-items:center}.li-v75-sheet{width:430px}}@media(max-width:640px){.${CARD_CLASS}[${META_ATTR}]::after{font-size:8px;max-width:42%;padding:2px 5px}.li-v75-fields{grid-template-columns:1fr 1fr}.li-v75-fields .li-v75-field:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  }

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
    return key ? node[key] : null;
  }

  function clickableAncestor(element) {
    let node = element;
    for (let depth = 0; node && depth < 7 && node !== document.body; depth++, node = node.parentElement) {
      if (node.matches('button,a,[role="button"]')) return node;
      const fiber = getFiber(node);
      const props = fiber && fiber.memoizedProps;
      if (props && typeof props.onClick === 'function') return node;
    }
    return null;
  }

  function rememberRelativePosition(element) {
    if (!element || element.dataset.liV75Positioned === '1') return;
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
      element.dataset.liV75Positioned = '1';
    }
  }

  function restoreRelativePosition(element) {
    if (element && element.dataset.liV75Positioned === '1') {
      element.style.removeProperty('position');
      delete element.dataset.liV75Positioned;
    }
  }

  function findOvrCard() {
    const root = document.getElementById('root') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let guard = 0;
    let best = null;
    let bestArea = Infinity;
    let overall = null;

    while (node && guard++ < 3500) {
      if (norm(node.nodeValue).toUpperCase() === 'OVR') {
        let el = node.parentElement;
        for (let depth = 0; el && depth < 5 && el !== document.body; depth++, el = el.parentElement) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 48 || rect.height < 48 || rect.width > 220 || rect.height > 190) continue;
          const text = norm(el.textContent).toUpperCase();
          const numbers = text.match(/\b\d{2}\b/g) || [];
          if (!numbers.length) continue;
          const area = rect.width * rect.height;
          if (area < bestArea) {
            best = el;
            bestArea = area;
            overall = Number(numbers[numbers.length - 1]);
          }
        }
      }
      node = walker.nextNode();
    }
    return best ? { card: best, overall } : null;
  }

  function clearOvrDecoration() {
    document.querySelectorAll(`.${OVR_CLASS}`).forEach((element) => {
      element.classList.remove(OVR_CLASS);
      element.removeAttribute(POT_ATTR);
      restoreRelativePosition(element);
    });
  }

  function decorateOvr() {
    clearOvrDecoration();
    const creation = creationFromActiveSave();
    const found = findOvrCard();
    if (!creation || !found || !Number.isFinite(found.overall)) {
      lastPlayer = creation ? { ...creation, overall: null } : null;
      return;
    }
    lastPlayer = { ...creation, overall: found.overall };
    if (!isEnabled()) return;
    rememberRelativePosition(found.card);
    found.card.classList.add(OVR_CLASS);
    const gap = Number(creation.potential) - Number(found.overall);
    found.card.setAttribute(POT_ATTR, `POT ${creation.potential} · ${gap >= 0 ? '+' : ''}${gap}`);
  }

  function clearClubDecorations() {
    document.querySelectorAll(`.${CARD_CLASS}`).forEach((card) => {
      card.classList.remove(CARD_CLASS, BEST_CLASS);
      card.removeAttribute(META_ATTR);
      restoreRelativePosition(card);
    });
  }

  function collectClickableClubCards() {
    const targets = [];
    if (!clubsByName || !clubsByName.size) return targets;
    const root = document.getElementById('root') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seenCards = new Set();
    let node = walker.nextNode();
    let guard = 0;

    while (node && guard++ < 4500) {
      const text = norm(node.nodeValue);
      const club = text ? clubsByName.get(text) : null;
      if (club) {
        const parent = node.parentElement;
        if (parent && isVisible(parent) && !parent.closest(`[${UI_ATTR}]`)) {
          const card = clickableAncestor(parent);
          if (card && !seenCards.has(card)) {
            const rect = card.getBoundingClientRect();
            if (rect.width >= 110 && rect.height >= 70 && rect.bottom > 0 && rect.top < innerHeight) {
              seenCards.add(card);
              targets.push({ card, club });
            }
          }
        }
      }
      node = walker.nextNode();
    }
    return targets;
  }

  async function decorateClubChoices() {
    clearClubDecorations();
    if (!isEnabled()) return;
    if (!clubsByName) {
      await loadClubsDb();
      if (!clubsByName) return;
    }
    const targets = collectClickableClubCards();
    if (targets.length < 2) return;

    const ovrs = targets.map((item) => Number(item.club.ovr)).filter(Number.isFinite);
    const bestOvr = ovrs.length ? Math.max(...ovrs) : null;
    for (const item of targets) {
      const parts = [];
      if (item.club.tier != null) parts.push(`T${item.club.tier}`);
      if (item.club.ovr != null) parts.push(`OVR ${item.club.ovr}`);
      const best = bestOvr != null && Number(item.club.ovr) === bestOvr;
      if (best) parts.push('★');
      rememberRelativePosition(item.card);
      item.card.classList.add(CARD_CLASS);
      if (best) item.card.classList.add(BEST_CLASS);
      item.card.setAttribute(META_ATTR, parts.join(' · '));
    }
  }

  function clearPresentation() {
    clearOvrDecoration();
    clearClubDecorations();
    document.getElementById(SEED_ENTRY_ID)?.remove();
  }

  function hideCoreLauncher() {
    const launcher = document.getElementById('legionnaire-insights-reopen');
    if (launcher) launcher.style.display = 'none';
    if (!isEnabled()) {
      const panel = document.getElementById('legionnaire-insights-panel');
      if (panel) panel.style.display = 'none';
    }
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
      const full = [...current.querySelectorAll('button')].find((button) => button.title === 'Full mode');
      if (full) full.click();
      setTimeout(() => current.querySelector(`.li-tab[data-tab="${tab}"]`)?.click(), 0);
    }, 0);
  }

  function profileLabel(profile) {
    return ({ early: 'מוקדמת', normal: 'רגילה', late: 'מאוחרת' })[profile] || norm(profile);
  }

  function closeQuick() {
    document.getElementById(QUICK_ID)?.remove();
  }

  function openQuick() {
    closeQuick();
    const player = lastPlayer;
    const overlay = document.createElement('div');
    overlay.id = QUICK_ID;
    overlay.className = 'li-v75-overlay';
    overlay.setAttribute(UI_ATTR, 'quick');
    const gap = player && Number.isFinite(Number(player.overall)) ? Number(player.potential) - Number(player.overall) : null;
    const sub = player
      ? `POT ${player.potential}${gap == null ? '' : ` · ${gap >= 0 ? '+' : ''}${gap}`} · ${profileLabel(player.developmentProfile)}`
      : 'Legionnaire Insights';
    overlay.innerHTML = `
      <div class="li-v75-sheet" role="dialog" aria-modal="true" aria-label="Legionnaire Insights">
        <div class="li-v75-head"><div><div class="li-v75-title">Legionnaire Insights</div><div class="li-v75-sub">${sub}</div></div><button class="li-v75-close" type="button" data-close>×</button></div>
        <div class="li-v75-grid">
          <button class="li-v75-btn" type="button" data-action="details">פרטים</button>
          <button class="li-v75-btn" type="button" data-primary="true" data-action="seed">מצא סיד</button>
          <button class="li-v75-btn" type="button" data-action="tools">כלים / Sync</button>
          <button class="li-v75-btn" type="button" data-danger="true" data-action="hide">הסתר LI</button>
        </div>
      </div>`;
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

  function ancestorLooksLikeOvr(target) {
    let node = target instanceof Element ? target : target?.parentElement;
    for (let depth = 0; node && depth < 6 && node !== document.body; depth++, node = node.parentElement) {
      const text = norm(node.textContent).toUpperCase();
      const rect = node.getBoundingClientRect();
      if (text.includes('OVR') && rect.width >= 45 && rect.height >= 45 && rect.width <= 240 && rect.height <= 210) return true;
    }
    return false;
  }

  function installDelegatedMenuTrigger() {
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`[${UI_ATTR}]`) || event.target.closest('#legionnaire-insights-panel')) return;
      if (!event.target.closest(`.${OVR_CLASS}`) && !ancestorLooksLikeOvr(event.target)) return;
      if (!isEnabled()) setEnabled(true);
      scheduleRender(0);
      setTimeout(openQuick, 0);
    }, true);

    window.addEventListener('keydown', (event) => {
      if (event.altKey && String(event.key).toLowerCase() === 'l') {
        const next = !isEnabled();
        setEnabled(next);
        if (next) setTimeout(openQuick, 0);
      }
    });
  }

  function readSeedPrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem(SEED_PREFS_KEY) || '{}');
      return {
        potential: Number(prefs.potential) || 94,
        overall: Number(prefs.overall) || 76,
        profile: ['any', 'early', 'normal', 'late'].includes(prefs.profile) ? prefs.profile : 'normal',
      };
    } catch (e) {
      return { potential: 94, overall: 76, profile: 'normal' };
    }
  }

  function saveSeedPrefs(prefs) {
    try { localStorage.setItem(SEED_PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function applySeed(seed) {
    const sport = getCurrentSport();
    const saveKey = sport === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
    let template = { lastName: 'Player', number: 10, foot: 'right', position: 'ST', cadence: 'intense' };
    if (sport === 'basketball') template.height = 190;
    try {
      const raw = localStorage.getItem(saveKey);
      if (raw) {
        const existing = JSON.parse(raw);
        template = {
          lastName: existing.lastName ?? template.lastName,
          number: existing.number ?? template.number,
          foot: existing.foot ?? template.foot,
          position: existing.position ?? template.position,
          cadence: existing.cadence ?? template.cadence,
        };
        if (sport === 'basketball') template.height = existing.height ?? template.height;
      }
    } catch (e) {}
    try {
      localStorage.setItem(saveKey, JSON.stringify({ ...template, seed, choices: [] }));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }

  function stopSeedSearch() {
    fallbackSeedToken++;
    if (seedWorker) {
      try { seedWorker.terminate(); } catch (e) {}
      seedWorker = null;
    }
  }

  function closeSeed() {
    stopSeedSearch();
    document.getElementById(SEED_ID)?.remove();
  }

  function appendSeedResult(container, seed, result) {
    const row = document.createElement('div');
    row.className = 'li-v75-result';
    row.setAttribute(UI_ATTR, 'seed-result');
    row.innerHTML = `<div class="li-v75-result-main"><strong>POT ${result.potential}</strong> · OVR ${result.startingOverall} · ${result.developmentProfile}${result.elite ? ' ★elite' : ''}<div class="li-v75-seed">${seed}</div></div><button class="li-v75-btn" data-primary="true" type="button">השתמש</button>`;
    row.querySelector('button').addEventListener('click', () => {
      const label = getCurrentSport() === 'basketball' ? 'כדורסל' : 'כדורגל';
      if (!confirm(`להתחיל קריירת ${label} חדשה עם הסיד הזה? הקריירה הפעילה תוחלף.`)) return;
      applySeed(seed);
    });
    container.appendChild(row);
  }

  function workerSource() {
    return `function sh(text){let r=2166136261>>>0;for(let i=0;i<text.length;i++){r^=text.charCodeAt(i);r=Math.imul(r,16777619)}return r>>>0}function Ks(seed){return{seed,state:sh(seed)||1}}function rh(state){const s=(state+1831565813)>>>0;let n=s;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return{state:s,value:((n^(n>>>14))>>>0)/4294967296}}function Zl(r){const n=rh(r.state);return{rng:{seed:r.seed,state:n.state},value:n.value}}function Xt(r,l,h){const n=Zl(r);return{rng:n.rng,value:l+n.value*(h-l)}}function Ql(r,l,h){if(h<l)return{rng:r,value:l};const n=Zl(r);return{rng:n.rng,value:l+Math.floor(n.value*(h-l+1))}}function Ve(r,p){const n=Zl(r);return{rng:n.rng,value:n.value<p}}function Mh(r){const n=Zl(r);return{rng:n.rng,value:n.value<.1?'early':n.value<.2?'late':'normal'}}function Sh(r,o){const a=Xt(r,0,1),v=a.value;let p;if(v<.12)p=62+(v/.12)*13;else if(v<.85)p=75+((v-.12)/.73)*9;else p=84+((v-.85)/.15)*9;const n=Xt(a.rng,-1,1);return{rng:n.rng,value:Math.max(o+4,Math.min(96,Math.round(p+n.value)))}}function compute(seed){let r=Ks(seed);const e=Ve(r,.1);r=e.rng;const b=e.value?[66,76]:[46,52];const o=Ql(r,b[0],b[1]);r=o.rng;const p=Mh(r);r=p.rng;const pot=Sh(r,o.value);return{elite:e.value,startingOverall:o.value,developmentProfile:p.value,potential:pot.value}}function randomSeed(){const c='abcdefghijklmnopqrstuvwxyz0123456789';const part=n=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');return part(8)+'-'+part(8)}onmessage=(event)=>{const q=event.data;let tries=0,found=0;while(tries<500000&&found<8){const seed=randomSeed(),r=compute(seed);tries++;if(r.potential===q.potential&&r.startingOverall===q.overall&&(q.profile==='any'||r.developmentProfile===q.profile)){found++;postMessage({type:'result',seed,result:r,tries,found})}if(tries%25000===0)postMessage({type:'progress',tries,found})}postMessage({type:'done',tries,found})};`;
  }

  function createSeedWorker() {
    try {
      const blob = new Blob([workerSource()], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return worker;
    } catch (e) {
      return null;
    }
  }

  function runFallbackSeedSearch(query, modal) {
    const token = ++fallbackSeedToken;
    const status = modal.querySelector('[data-status]');
    const results = modal.querySelector('[data-results]');
    let tries = 0;
    let found = 0;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const randomSeed = () => {
      const part = (length) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return `${part(8)}-${part(8)}`;
    };

    function chunk(deadline) {
      if (token !== fallbackSeedToken || !document.body.contains(modal)) return;
      let count = 0;
      while (tries < 500000 && found < 8 && count++ < 1000 && (!deadline || deadline.timeRemaining() > 2)) {
        const seed = randomSeed();
        const result = computeCreation(seed);
        tries++;
        if (result.potential === query.potential && result.startingOverall === query.overall && (query.profile === 'any' || result.developmentProfile === query.profile)) {
          found++;
          appendSeedResult(results, seed, result);
        }
      }
      status.textContent = `נבדקו ${tries.toLocaleString()} · נמצאו ${found}`;
      if (tries >= 500000 || found >= 8) { status.textContent = `הסתיים · נבדקו ${tries.toLocaleString()} · נמצאו ${found}`; return; }
      if (typeof requestIdleCallback === 'function') requestIdleCallback(chunk, { timeout: 120 });
      else setTimeout(() => chunk(null), 20);
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(chunk, { timeout: 120 });
    else setTimeout(() => chunk(null), 20);
  }

  function runSeedSearch(modal) {
    stopSeedSearch();
    const query = {
      potential: Number(modal.querySelector('[data-pot]').value) || 94,
      overall: Number(modal.querySelector('[data-ovr]').value) || 76,
      profile: modal.querySelector('[data-profile]').value,
    };
    saveSeedPrefs(query);
    const status = modal.querySelector('[data-status]');
    const results = modal.querySelector('[data-results]');
    results.innerHTML = '';
    status.textContent = 'מחפש…';

    const worker = createSeedWorker();
    if (!worker) {
      runFallbackSeedSearch(query, modal);
      return;
    }
    seedWorker = worker;
    worker.onmessage = (event) => {
      if (!document.body.contains(modal)) { stopSeedSearch(); return; }
      const message = event.data || {};
      if (message.type === 'result') appendSeedResult(results, message.seed, message.result);
      if (message.type === 'progress' || message.type === 'result') status.textContent = `נבדקו ${Number(message.tries || 0).toLocaleString()} · נמצאו ${message.found || 0}`;
      if (message.type === 'done') {
        status.textContent = `הסתיים · נבדקו ${Number(message.tries || 0).toLocaleString()} · נמצאו ${message.found || 0}`;
        stopSeedSearch();
      }
    };
    worker.onerror = () => {
      stopSeedSearch();
      status.textContent = 'Worker לא זמין; ממשיך בחיפוש חסכוני…';
      runFallbackSeedSearch(query, modal);
    };
    worker.postMessage(query);
  }

  function openSeed() {
    closeSeed();
    const prefs = readSeedPrefs();
    const overlay = document.createElement('div');
    overlay.id = SEED_ID;
    overlay.className = 'li-v75-overlay';
    overlay.setAttribute(UI_ATTR, 'seed');
    overlay.innerHTML = `<div class="li-v75-sheet" role="dialog" aria-modal="true" aria-label="מציאת סיד"><div class="li-v75-head"><div><div class="li-v75-title">מציאת סיד</div><div class="li-v75-sub">החיפוש רץ מחוץ ל-thread של המשחק כשאפשר.</div></div><button class="li-v75-close" type="button" data-close>×</button></div><div class="li-v75-fields"><label class="li-v75-field">Potential<input data-pot type="number" min="50" max="96" value="${prefs.potential}"></label><label class="li-v75-field">Starting OVR<input data-ovr type="number" min="40" max="90" value="${prefs.overall}"></label><label class="li-v75-field">Development<select data-profile><option value="any">כל פרופיל</option><option value="early">early</option><option value="normal">normal</option><option value="late">late</option></select></label></div><div class="li-v75-actions"><button class="li-v75-btn" data-primary="true" type="button" data-search>חפש סידים</button><button class="li-v75-btn" type="button" data-stop>עצור</button></div><div class="li-v75-status" data-status>בחר ערכים ולחץ חיפוש.</div><div class="li-v75-results" data-results></div></div>`;
    overlay.querySelector('[data-profile]').value = prefs.profile;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) closeSeed();
      if (event.target.closest('[data-search]')) runSeedSearch(overlay);
      if (event.target.closest('[data-stop]')) { stopSeedSearch(); overlay.querySelector('[data-status]').textContent = 'החיפוש נעצר.'; }
    });
    document.body.appendChild(overlay);
  }

  function findCareerStartButton() {
    const labels = ['קריירה חדשה', 'התחל קריירה חדשה', 'התחל קריירה', 'שחקן חדש'];
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
      button.id = SEED_ENTRY_ID;
      button.type = 'button';
      button.setAttribute(UI_ATTR, 'seed-entry');
      button.textContent = '✨ מצא סיד לקריירה חדשה';
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openSeed(); });
    }
    if (button.parentElement !== start.parentElement) start.insertAdjacentElement('afterend', button);
  }

  async function render() {
    renderTimer = null;
    if (document.visibilityState === 'hidden') return;
    lastRenderAt = Date.now();
    hideCoreLauncher();
    if (!isEnabled()) { clearPresentation(); return; }
    decorateOvr();
    await decorateClubChoices();
    ensureSeedEntry();
  }

  function scheduleRender(delay = 0) {
    if (document.visibilityState === 'hidden') return;
    const wait = Math.max(delay, lastRenderAt + RENDER_MIN_MS - Date.now(), 0);
    if (renderTimer) return;
    renderTimer = setTimeout(() => { render().catch(() => {}); }, wait);
  }

  function mutationIsOnlyOurs(mutation) {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
    if (!nodes.length) return false;
    return nodes.every((node) => node.matches?.(`[${UI_ATTR}]`) || node.closest?.(`[${UI_ATTR}]`));
  }

  function installObservers() {
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver((mutations) => {
      if (document.visibilityState === 'hidden') return;
      if (mutations.every(mutationIsOnlyOurs)) return;
      scheduleRender(120);
    });
    observer.observe(root, { childList: true, subtree: true });

    lastSaveSignature = getSaveSignature();
    setInterval(() => {
      const signature = getSaveSignature();
      if (signature !== lastSaveSignature) {
        lastSaveSignature = signature;
        scheduleRender(50);
      }
    }, SAVE_POLL_MS);

    setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRender(0);
    }, FALLBACK_RENDER_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleRender(80);
    });
  }

  ensureStyles();
  try { localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
  hideCoreLauncher();
  installDelegatedMenuTrigger();
  installObservers();
  loadClubsDb().then(() => scheduleRender(0));
  scheduleRender(0);
})();
