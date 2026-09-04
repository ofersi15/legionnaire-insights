(function () {
  'use strict';

  // v7.4 layers on top of native-ui-7.3.0. 7.3 keeps ownership of club-card
  // annotations; this file removes its space-consuming summary row and adds
  // a zero-layout header chip, native seed workflow, and full hide/restore.
  const MODE_KEY = 'legionnaire-insights:mode';
  const VISIBLE_KEY = 'legionnaire-insights:native-visible-v1';
  const STYLE_ID = 'legionnaire-insights-native-v74-style';
  const CHIP_ID = 'legionnaire-insights-v74-chip';
  const QUICK_ID = 'legionnaire-insights-v74-quick';
  const SEED_ID = 'legionnaire-insights-v74-seed';
  const SEED_ENTRY_ID = 'legionnaire-insights-v74-seed-entry';
  const SEED_PREFS_KEY = 'legionnaire-insights:seed-prefs-v1';
  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';
  const DISABLED_CLASS = 'li-v74-disabled';
  const POLL_MS = 600;

  let lastPlayer = null;
  let seedSearchToken = 0;

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
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

  function findRootFiber() {
    let fiber = getFiber(document.getElementById('root') || document.body);
    if (!fiber) {
      for (const element of document.querySelectorAll('*')) {
        fiber = getFiber(element);
        if (fiber) break;
      }
    }
    while (fiber && fiber.return) fiber = fiber.return;
    return fiber;
  }

  function currentPlayer() {
    const root = findRootFiber();
    if (!root) return null;
    const stack = [root];
    const seen = new Set();
    let fallback = null;
    let guard = 0;
    while (stack.length && guard++ < 50000) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && props.player && props.player.potential !== undefined) {
        if (props.decision && 'onChoose' in props) return props.player;
        if (!fallback) fallback = props.player;
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return fallback;
  }

  function isEnabled() {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function setEnabled(enabled) {
    try { localStorage.setItem(VISIBLE_KEY, enabled ? '1' : '0'); } catch (e) {}
    document.documentElement.classList.toggle(DISABLED_CLASS, !enabled);
    if (!enabled) {
      try { localStorage.setItem(MODE_KEY, 'hidden'); } catch (e) {}
      document.getElementById('legionnaire-insights-panel')?.style.setProperty('display', 'none');
      closeQuick();
      closeSeed();
      removeV74Ui();
    } else {
      render();
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* 7.3 summary used ~100px on mobile. Keep its data logic, but remove its layout. */
      #legionnaire-insights-native-summary{display:none!important}
      html.${DISABLED_CLASS} .li-native-option{display:none!important}
      html.${DISABLED_CLASS} .li-native-strongest{outline:none!important}
      html.${DISABLED_CLASS} #${CHIP_ID},html.${DISABLED_CLASS} #${SEED_ENTRY_ID}{display:none!important}
      .li-v74-header-host{position:relative!important}
      #${CHIP_ID}{position:absolute;left:8px;top:8px;z-index:5;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;max-width:48%;min-height:28px;padding:5px 8px;border:1px solid rgba(74,222,128,.45);border-radius:999px;background:rgba(8,10,15,.94);color:#e5e7eb;box-shadow:0 4px 14px rgba(0,0,0,.22);backdrop-filter:blur(8px);font:800 10px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;direction:ltr;white-space:nowrap;cursor:pointer}
      #${CHIP_ID} .li-v74-brand{color:#4ade80;font:900 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${CHIP_ID} strong{color:#facc15;font-size:12px}#${CHIP_ID} .li-v74-profile{color:#9ca3af;overflow:hidden;text-overflow:ellipsis}
      .li-v74-overlay{position:fixed;inset:0;z-index:1000002;display:flex;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));background:rgba(0,0,0,.5)}
      .li-v74-sheet{width:min(430px,100%);max-height:min(84dvh,720px);overflow:auto;border:1px solid #3f4652;border-radius:17px;background:#0b0d12;color:#e5e7eb;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:13px;direction:rtl;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
      .li-v74-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.li-v74-title{font-size:17px;font-weight:900}.li-v74-sub{margin-top:2px;color:#9ca3af;font-size:11px;font-weight:500}.li-v74-close{width:36px;height:36px;flex:0 0 36px;border:1px solid #475569;border-radius:9px;background:#191d25;color:#e5e7eb;font-size:20px;cursor:pointer}
      .li-v74-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.li-v74-btn{min-height:40px;border:1px solid #475569;border-radius:10px;background:#191d25;color:#f3f4f6;font:750 12px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer}.li-v74-btn[data-primary="true"]{background:#4ade80;color:#06250f;border-color:#4ade80}.li-v74-btn[data-danger="true"]{color:#fca5a5}
      .li-v74-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.li-v74-field{display:flex;flex-direction:column;gap:4px;color:#aeb6c3;font-size:10px}.li-v74-field input,.li-v74-field select{min-width:0;height:38px;border:1px solid #475569;border-radius:9px;background:#11151c;color:#f3f4f6;padding:0 9px;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}.li-v74-actions{display:flex;gap:7px}.li-v74-actions .li-v74-btn{flex:1}.li-v74-status{min-height:18px;margin:9px 1px;color:#9ca3af;font-size:11px}.li-v74-results{display:grid;gap:7px}.li-v74-result{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #303641;border-radius:11px;background:#11151b;padding:9px}.li-v74-result-main{direction:ltr;text-align:left;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}.li-v74-result-main strong{color:#facc15;font-size:14px}.li-v74-seed{margin-top:2px;color:#94a3b8;font-size:9px;overflow-wrap:anywhere}.li-v74-result .li-v74-btn{min-height:34px;padding:0 10px}
      #${SEED_ENTRY_ID}{margin:8px 0 0!important;min-height:40px!important;border:1px solid rgba(74,222,128,.5)!important;border-radius:10px!important;background:rgba(10,25,16,.92)!important;color:#86efac!important;font:800 12px system-ui,-apple-system,Segoe UI,sans-serif!important;cursor:pointer!important}
      @media(min-width:700px){.li-v74-overlay{align-items:center}.li-v74-sheet{width:430px}}
      @media(max-width:640px){#${CHIP_ID}{left:7px;top:7px;max-width:47%;min-height:26px;padding:4px 7px;font-size:9px}#${CHIP_ID} strong{font-size:11px}#${CHIP_ID} .li-v74-profile{display:none}.li-v74-fields{grid-template-columns:1fr 1fr}.li-v74-fields .li-v74-field:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function findExactText(text) {
    const needle = norm(text);
    for (const element of document.querySelectorAll('button,[role="button"],div,span,h1,h2,h3,h4,p,strong')) {
      if (!visible(element) || element.closest('#legionnaire-insights-panel') || element.closest('[data-li-v74]')) continue;
      if (norm(element.textContent) === needle) return element;
    }
    return null;
  }

  function findContainsText(text) {
    const needle = norm(text);
    let best = null;
    let bestLength = Infinity;
    for (const element of document.querySelectorAll('button,[role="button"],div,span,h1,h2,h3,h4,p,strong')) {
      if (!visible(element) || element.closest('#legionnaire-insights-panel') || element.closest('[data-li-v74]')) continue;
      const haystack = norm(element.textContent);
      if (haystack.includes(needle) && haystack.length < bestLength) {
        best = element;
        bestLength = haystack.length;
      }
    }
    return best;
  }

  function clickableFor(element) {
    let node = element;
    let fallback = null;
    for (let depth = 0; node && depth < 7 && node !== document.body; depth++, node = node.parentElement) {
      const fiber = getFiber(node);
      const props = fiber && fiber.memoizedProps;
      if (node.matches('button,a,[role="button"]') || (props && typeof props.onClick === 'function')) return node;
      try { if (getComputedStyle(node).cursor === 'pointer') fallback = node; } catch (e) {}
    }
    return fallback || (element && element.parentElement);
  }

  function transferHeader() {
    const title = findExactText('חלון העברות') || findContainsText('חלון העברות');
    if (!title) return null;
    let node = title.parentElement;
    let best = node;
    for (let depth = 0; node && depth < 4 && node !== document.body; depth++, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 220 && rect.height >= 34 && rect.height <= 130) best = node;
      if (rect.height > 130) break;
    }
    return best;
  }

  function profileLabel(profile) {
    return ({ early: 'מוקדמת', normal: 'רגילה', late: 'מאוחרת' })[profile] || norm(profile);
  }

  function ensureChip(player) {
    if (!isEnabled()) {
      document.getElementById(CHIP_ID)?.remove();
      return;
    }
    const host = transferHeader();
    if (!host || !player) {
      document.getElementById(CHIP_ID)?.remove();
      return;
    }
    host.classList.add('li-v74-header-host');
    let chip = document.getElementById(CHIP_ID);
    if (!chip) {
      chip = document.createElement('button');
      chip.id = CHIP_ID;
      chip.type = 'button';
      chip.setAttribute('data-li-v74', 'chip');
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openQuick();
      });
    }
    const gap = Number(player.potential) - Number(player.overall);
    chip.innerHTML = `<span class="li-v74-brand">LI</span><span>POT <strong>${player.potential}</strong> ${gap >= 0 ? '+' : ''}${gap}</span><span class="li-v74-profile">${profileLabel(player.developmentProfile)}</span>`;
    if (chip.parentElement !== host) host.appendChild(chip);
  }

  function hideCoreLauncher() {
    const reopen = document.getElementById('legionnaire-insights-reopen');
    if (reopen) reopen.style.display = 'none';
    if (!isEnabled()) {
      const panel = document.getElementById('legionnaire-insights-panel');
      if (panel) panel.style.display = 'none';
    }
  }

  function openCorePanel(tab) {
    const panel = document.getElementById('legionnaire-insights-panel');
    const reopen = document.getElementById('legionnaire-insights-reopen');
    if (!panel || !reopen) return;
    let mode = 'hidden';
    try { mode = localStorage.getItem(MODE_KEY) || 'hidden'; } catch (e) {}
    if (mode === 'hidden') reopen.click();
    setTimeout(() => {
      const current = document.getElementById('legionnaire-insights-panel');
      if (!current) return;
      const full = [...current.querySelectorAll('button')].find((button) => button.title === 'Full mode');
      if (full) full.click();
      setTimeout(() => current.querySelector(`.li-tab[data-tab="${tab}"]`)?.click(), 0);
    }, 0);
  }

  function closeQuick() {
    document.getElementById(QUICK_ID)?.remove();
  }

  function openQuick() {
    closeQuick();
    const player = lastPlayer || currentPlayer();
    if (!player) return;
    const gap = Number(player.potential) - Number(player.overall);
    const overlay = document.createElement('div');
    overlay.id = QUICK_ID;
    overlay.className = 'li-v74-overlay';
    overlay.setAttribute('data-li-v74', 'quick');
    overlay.innerHTML = `
      <div class="li-v74-sheet" role="dialog" aria-modal="true" aria-label="Legionnaire Insights">
        <div class="li-v74-head"><div><div class="li-v74-title">Legionnaire Insights</div><div class="li-v74-sub">POT ${player.potential} · ${gap >= 0 ? '+' : ''}${gap} · ${profileLabel(player.developmentProfile)}</div></div><button class="li-v74-close" type="button" data-close>×</button></div>
        <div class="li-v74-grid"><button class="li-v74-btn" type="button" data-action="details">פרטים</button><button class="li-v74-btn" type="button" data-primary="true" data-action="seed">מצא סיד</button><button class="li-v74-btn" type="button" data-action="tools">כלים / Sync</button><button class="li-v74-btn" type="button" data-danger="true" data-action="hide">הסתר LI</button></div>
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

  function findOvrTarget(player) {
    if (!player || player.overall == null) return null;
    const wanted = String(player.overall);
    const candidates = [];
    for (const element of document.querySelectorAll('span,div,strong')) {
      if (!visible(element) || norm(element.textContent) !== wanted || element.closest('[data-li-v74]')) continue;
      let node = element.parentElement;
      let foundOvr = false;
      for (let depth = 0; node && depth < 4 && node !== document.body; depth++, node = node.parentElement) {
        if (norm(node.textContent).toUpperCase().includes('OVR')) { foundOvr = true; break; }
      }
      if (foundOvr) candidates.push(element);
    }
    candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return candidates[0] || null;
  }

  function bindRestore(player) {
    const target = findOvrTarget(player);
    if (!target || target.dataset.liV74Restore === '1') return;
    target.dataset.liV74Restore = '1';
    target.addEventListener('click', (event) => {
      if (!isEnabled()) {
        event.preventDefault();
        event.stopPropagation();
        setEnabled(true);
      }
      setTimeout(openQuick, 0);
    });
  }

  // ---------- Native seed finder ----------

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
  function randomSeed() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const part = (length) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part(8)}-${part(8)}`;
  }

  function getCurrentSport() {
    try { return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football'; }
    catch (e) { return 'football'; }
  }
  function getSaveKey(sport) {
    return sport === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
  }
  function applySeed(seed) {
    const sport = getCurrentSport();
    const saveKey = getSaveKey(sport);
    let template = { lastName: 'Player', number: 10, foot: 'right', position: 'ST', cadence: 'intense' };
    if (sport === 'basketball') template.height = 190;
    try {
      const raw = localStorage.getItem(saveKey);
      if (raw) {
        const existing = JSON.parse(raw);
        template = { lastName: existing.lastName ?? template.lastName, number: existing.number ?? template.number, foot: existing.foot ?? template.foot, position: existing.position ?? template.position, cadence: existing.cadence ?? template.cadence };
        if (sport === 'basketball') template.height = existing.height ?? template.height;
      }
    } catch (e) {}
    try {
      localStorage.setItem(saveKey, JSON.stringify({ ...template, seed, choices: [] }));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }

  function readSeedPrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem(SEED_PREFS_KEY) || '{}');
      return { potential: Number(prefs.potential) || 94, overall: Number(prefs.overall) || 76, profile: ['any', 'early', 'normal', 'late'].includes(prefs.profile) ? prefs.profile : 'normal' };
    } catch (e) { return { potential: 94, overall: 76, profile: 'normal' }; }
  }
  function saveSeedPrefs(prefs) {
    try { localStorage.setItem(SEED_PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
  }
  function closeSeed() {
    seedSearchToken++;
    document.getElementById(SEED_ID)?.remove();
  }

  function appendSeedResult(container, seed, result) {
    const row = document.createElement('div');
    row.className = 'li-v74-result';
    row.innerHTML = `<div class="li-v74-result-main"><strong>POT ${result.potential}</strong> · OVR ${result.startingOverall} · ${result.developmentProfile}${result.elite ? ' ★elite' : ''}<div class="li-v74-seed">${seed}</div></div><button class="li-v74-btn" data-primary="true" type="button">השתמש</button>`;
    row.querySelector('button').addEventListener('click', () => {
      const label = getCurrentSport() === 'basketball' ? 'כדורסל' : 'כדורגל';
      if (!confirm(`להתחיל קריירת ${label} חדשה עם הסיד הזה? הקריירה הפעילה תוחלף.`)) return;
      applySeed(seed);
    });
    container.appendChild(row);
  }

  function runSeedSearch(modal) {
    const potential = Number(modal.querySelector('[data-pot]').value) || 94;
    const overall = Number(modal.querySelector('[data-ovr]').value) || 76;
    const profile = modal.querySelector('[data-profile]').value;
    const status = modal.querySelector('[data-status]');
    const results = modal.querySelector('[data-results]');
    saveSeedPrefs({ potential, overall, profile });
    results.innerHTML = '';
    const token = ++seedSearchToken;
    let tries = 0;
    let found = 0;
    const maxTries = 500000;
    const maxResults = 8;
    const batchSize = 12000;
    status.textContent = 'מחפש…';
    function batch() {
      if (token !== seedSearchToken || !document.body.contains(modal)) return;
      for (let i = 0; i < batchSize && tries < maxTries && found < maxResults; i++, tries++) {
        const seed = randomSeed();
        const candidate = computeCreation(seed);
        if (candidate.potential !== potential || candidate.startingOverall !== overall) continue;
        if (profile !== 'any' && candidate.developmentProfile !== profile) continue;
        found++;
        appendSeedResult(results, seed, candidate);
      }
      status.textContent = `נבדקו ${tries.toLocaleString()} · נמצאו ${found}`;
      if (tries < maxTries && found < maxResults) setTimeout(batch, 0);
      else status.textContent = `הסתיים · נבדקו ${tries.toLocaleString()} · נמצאו ${found}`;
    }
    batch();
  }

  function openSeed() {
    closeSeed();
    const prefs = readSeedPrefs();
    const overlay = document.createElement('div');
    overlay.id = SEED_ID;
    overlay.className = 'li-v74-overlay';
    overlay.setAttribute('data-li-v74', 'seed');
    overlay.innerHTML = `
      <div class="li-v74-sheet" role="dialog" aria-modal="true" aria-label="מציאת סיד">
        <div class="li-v74-head"><div><div class="li-v74-title">מציאת סיד</div><div class="li-v74-sub">חיפוש ושימוש בסיד בלי לפתוח את הפאנל הישן. הערכים נשמרים לפעם הבאה.</div></div><button class="li-v74-close" type="button" data-close>×</button></div>
        <div class="li-v74-fields"><label class="li-v74-field">Potential<input data-pot type="number" min="50" max="96" value="${prefs.potential}"></label><label class="li-v74-field">Starting OVR<input data-ovr type="number" min="40" max="90" value="${prefs.overall}"></label><label class="li-v74-field">Development<select data-profile><option value="any">כל פרופיל</option><option value="early">early</option><option value="normal">normal</option><option value="late">late</option></select></label></div>
        <div class="li-v74-actions"><button class="li-v74-btn" data-primary="true" type="button" data-search>חפש סידים</button><button class="li-v74-btn" type="button" data-stop>עצור</button></div><div class="li-v74-status" data-status>בחר ערכים ולחץ חיפוש.</div><div class="li-v74-results" data-results></div>
      </div>`;
    overlay.querySelector('[data-profile]').value = prefs.profile;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) closeSeed();
      if (event.target.closest('[data-search]')) runSeedSearch(overlay);
      if (event.target.closest('[data-stop]')) { seedSearchToken++; overlay.querySelector('[data-status]').textContent = 'החיפוש נעצר.'; }
    });
    document.body.appendChild(overlay);
  }

  function findCareerStart() {
    for (const label of ['קריירה חדשה', 'התחל קריירה חדשה', 'התחל קריירה', 'שחקן חדש']) {
      const text = findExactText(label) || findContainsText(label);
      const clickable = text && clickableFor(text);
      if (clickable) return clickable;
    }
    return null;
  }

  function ensureSeedEntry() {
    if (!isEnabled()) {
      document.getElementById(SEED_ENTRY_ID)?.remove();
      return;
    }
    const start = findCareerStart();
    if (!start || !start.parentElement) {
      document.getElementById(SEED_ENTRY_ID)?.remove();
      return;
    }
    let button = document.getElementById(SEED_ENTRY_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = SEED_ENTRY_ID;
      button.type = 'button';
      button.setAttribute('data-li-v74', 'seed-entry');
      button.textContent = '✨ מצא סיד לקריירה חדשה';
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openSeed(); });
    }
    if (button.parentElement !== start.parentElement) start.insertAdjacentElement('afterend', button);
  }

  function removeV74Ui() {
    document.getElementById(CHIP_ID)?.remove();
    document.getElementById(SEED_ENTRY_ID)?.remove();
    document.querySelectorAll('.li-v74-header-host').forEach((element) => element.classList.remove('li-v74-header-host'));
  }

  function installHiddenRestore() {
    let timer = null;
    window.addEventListener('pointerdown', (event) => {
      if (isEnabled() || event.clientX > 56 || event.clientY > 56) return;
      clearTimeout(timer);
      timer = setTimeout(() => { setEnabled(true); setTimeout(openQuick, 0); }, 850);
    }, { passive: true });
    for (const name of ['pointerup', 'pointercancel', 'pointermove']) {
      window.addEventListener(name, () => { clearTimeout(timer); timer = null; }, { passive: true });
    }
    window.addEventListener('keydown', (event) => {
      if (event.altKey && String(event.key).toLowerCase() === 'l') {
        setEnabled(!isEnabled());
        if (isEnabled()) setTimeout(openQuick, 0);
      }
    });
  }

  function render() {
    document.documentElement.classList.toggle(DISABLED_CLASS, !isEnabled());
    hideCoreLauncher();
    const player = currentPlayer();
    if (player) {
      lastPlayer = player;
      bindRestore(player);
    }
    ensureSeedEntry();
    if (!isEnabled()) {
      removeV74Ui();
      return;
    }
    ensureChip(player);
  }

  ensureStyles();
  installHiddenRestore();
  render();
  setInterval(render, POLL_MS);
  window.addEventListener('load', render);
})();
