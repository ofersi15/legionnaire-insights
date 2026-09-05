(function () {
  'use strict';

  // Legionnaire Insights v8.2.3: one event-driven runtime, no gameplay polling,
  // no React-root scans, and no localStorage fingerprinting.

  const VERSION = '8.2.3';
  const DESKTOP_MIN_WIDTH = 900;
  const SCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js';
  const GIST_ID = 'e1226286d7087eb8faacbf820b8b666f';
  const GIST_OWNER = 'ofersi15';

  const GH_TOKEN_GM_KEY = 'github-token-v1';
  const LEGACY_GH_TOKEN_KEY = 'legionnaire-insights:gh-token';
  const LAST_PULL_GM_KEY = 'legionnaire-insights:v8:last-pull';
  const LAST_PUSH_GM_KEY = 'legionnaire-insights:v8:last-push';
  const UPDATE_LAST_CHECK_GM_KEY = 'legionnaire-insights:update-last-check';
  const UPDATE_LATEST_GM_KEY = 'legionnaire-insights:update-latest-version';

  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const LEGACY_SAVE_KEY = 'maslul-kariera:save:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';
  const VISIBLE_KEY = 'legionnaire-insights:v8:visible';
  const HUD_POS_KEY = 'legionnaire-insights:v8:hud-position';
  const OLD_HUD_POS_KEY = 'legionnaire-insights:hud-position-v3';
  const CLUB_CACHE_KEY = 'legionnaire-insights:club-cache-v4';
  const SEED_PREFS_KEY = 'legionnaire-insights:seed-prefs-v1';
  const DEBUG_KEY = 'legionnaire-insights:v8:debug';
  const PREDICTIONS_KEY = 'legionnaire-insights:v8:predictions';

  const HUD_ID = 'legionnaire-insights-v8-hud';
  const SHEET_ID = 'legionnaire-insights-v8-sheet';
  const STYLE_ID = 'legionnaire-insights-v8-style';
  const BADGE_ATTR = 'data-li-v8-club-badge';
  const CARD_ATTR = 'data-li-v8-club-card';
  const PREDICTED_ATTR = 'data-li-v8-predicted';
  const PREDICTION_MARKER_ATTR = 'data-li-v8-prediction-marker';
  const UI_ATTR = 'data-li-v8';
  const BEST_CLASS = 'li-v8-best';

  const SYNC_EXCLUDE = new Set(['maslul-kariera:sport:v1', 'maslul-kariera:currency:v1']);
  const SUM_NUMBER_KEYS = new Set(['maslul-kariera:careers-completed:v1']);
  const SUM_MAP_KEYS = new Set(['maslul-kariera:collection:v1', 'maslul-kariera:basketball:collection:v2']);
  const UNION_ARRAY_KEYS = new Set(['maslul-kariera:football:careers:v1', 'maslul-kariera:basketball:careers:v1']);
  const ACTIVE_SAVE_KEYS = new Set([
    'maslul-kariera:football:save:v2',
    'maslul-kariera:basketball:save:v2',
    LEGACY_SAVE_KEY,
  ]);
  const LEDGER_META_KEY = 'maslul-kariera-sync:ledger:v3';
  const DEVICE_ID_KEY = 'maslul-kariera-sync:device-id';
  const OLD_BASELINE_KEY = 'maslul-kariera-sync:baseline:v1';
  const CAREERS_COMPLETED_KEY = 'maslul-kariera:careers-completed:v1';

  const PER_SPORT_KEYS = {
    football: {
      careers: 'maslul-kariera:football:careers:v1',
      save: 'maslul-kariera:football:save:v2',
      collection: 'maslul-kariera:collection:v1',
    },
    basketball: {
      careers: 'maslul-kariera:basketball:careers:v1',
      save: 'maslul-kariera:basketball:save:v2',
      collection: 'maslul-kariera:basketball:collection:v2',
    },
  };

  const DEVICE_FILE_PREFIX = 'legionnaire-device-';
  const DEVICE_FILE_SUFFIX = '.snapshot.json';
  const LEGACY_GIST_FILES = {
    meta: 'legionnaire-sync-meta.json',
    numbers: 'legionnaire-sync-numbers.json',
    mapFootball: 'legionnaire-sync-map-football.json',
    mapBasketball: 'legionnaire-sync-map-basketball.json',
    careersFootball: 'legionnaire-sync-careers-football.json',
    careersBasketball: 'legionnaire-sync-careers-basketball.json',
    other: 'legionnaire-sync-other.json',
  };

  const AGENTS = [
    { name: 'רפי בן־עמי', type: 'מקומי', condition: 'תמיד זמין', bonus: '+30% הצעות / +5% שווי', clubIds: ['il-1061', 'il-2173', 'il-2182'] },
    { name: 'מוטי אשכנזי', type: 'מחובר', condition: 'OVR מעל 66', bonus: '+40% הצעות / כ־5% שווי בליגת העל' },
    { name: 'עדן רויטפרב', type: 'MLS', condition: 'גיל מעל 18 וגם OVR מעל 72', bonus: '+40% הצעות / כ־4% שווי ב־MLS' },
    { name: 'יורם שגיב', type: 'בינלאומי', condition: 'גיל מעל 19 וגם OVR מעל 76', bonus: '+50% הצעות / +4.5% שווי בבלגיה' },
    { name: 'אבנר לביא', type: 'סוכן־על', condition: 'OVR מעל 84 או תואר אירופי', bonus: '+80% הצעות / +10% שווי בקבוצות עלית' },
    { name: 'מעגל האגדה', type: 'אגדה', condition: 'הופך לאגדת מועדון', bonus: 'נשאר במועדון' },
  ];

  let clubByName = null;
  let clubById = null;
  let clubItems = [];
  let clubMapSport = '';
  let clubSource = '';
  let clubLoadPromise = null;
  let uiTimers = [];
  let seedWorker = null;
  let syncInFlight = null;
  let latestScriptVersion = GM_getValue(UPDATE_LATEST_GM_KEY, '');
  let resizeFrame = 0;
  const creationMemo = new Map();
  const timings = new Map();

  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function measure(name, fn) {
    const start = performance.now();
    try { return fn(); }
    finally {
      const ms = performance.now() - start;
      const row = timings.get(name) || { count: 0, total: 0, max: 0, last: 0 };
      row.count++; row.total += ms; row.max = Math.max(row.max, ms); row.last = ms;
      timings.set(name, row);
    }
  }

  async function measureAsync(name, fn) {
    const start = performance.now();
    try { return await fn(); }
    finally {
      const ms = performance.now() - start;
      const row = timings.get(name) || { count: 0, total: 0, max: 0, last: 0 };
      row.count++; row.total += ms; row.max = Math.max(row.max, ms); row.last = ms;
      timings.set(name, row);
    }
  }

  function sport() {
    try { return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football'; }
    catch (e) { return 'football'; }
  }

  function preferredSaveKey() { return PER_SPORT_KEYS[sport()].save; }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function activeSaveRecords() {
    const preferred = preferredSaveKey();
    const other = sport() === 'football' ? PER_SPORT_KEYS.basketball.save : PER_SPORT_KEYS.football.save;
    const records = [];
    for (const key of [preferred, LEGACY_SAVE_KEY, other]) {
      const save = readJson(key, null);
      if (save && typeof save === 'object' && save.seed != null && save.seed !== '') records.push({ key, save });
    }
    return records;
  }

  function activeSaveRecord() { return activeSaveRecords()[0] || null; }

  function activeSave() { return activeSaveRecord()?.save || null; }
  function activeSaveKey() { return activeSaveRecord()?.key || preferredSaveKey(); }

  function enabled() {
    try { return localStorage.getItem(VISIBLE_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function setEnabled(value) {
    try { localStorage.setItem(VISIBLE_KEY, value ? '1' : '0'); } catch (e) {}
    closeSheet();
    clearClubBadges();
    syncHud();
  }

  // ---------- Character creation / fixed POT ----------
  function sh(text) { let r = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { r ^= text.charCodeAt(i); r = Math.imul(r, 16777619); } return r >>> 0; }
  function Ks(seed) { return { seed, state: sh(seed) || 1 }; }
  function rh(state) { const s = (state + 1831565813) >>> 0; let n = s; n = Math.imul(n ^ (n >>> 15), n | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return { state: s, value: ((n ^ (n >>> 14)) >>> 0) / 4294967296 }; }
  function Zl(rng) { const n = rh(rng.state); return { rng: { seed: rng.seed, state: n.state }, value: n.value }; }
  function Xt(rng, lo, hi) { const n = Zl(rng); return { rng: n.rng, value: lo + n.value * (hi - lo) }; }
  function Ql(rng, lo, hi) { if (hi < lo) return { rng, value: lo }; const n = Zl(rng); return { rng: n.rng, value: lo + Math.floor(n.value * (hi - lo + 1)) }; }
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
  function computeCreation(seed) {
    const key = String(seed);
    if (creationMemo.has(key)) return creationMemo.get(key);
    let rng = Ks(key);
    const elite = Ve(rng, 0.1); rng = elite.rng;
    const bounds = elite.value ? [66, 76] : [46, 52];
    const overall = Ql(rng, bounds[0], bounds[1]); rng = overall.rng;
    const profile = Mh(rng); rng = profile.rng;
    const result = { seed: key, startingOverall: overall.value, developmentProfile: profile.value, potential: Sh(rng, overall.value), elite: elite.value };
    creationMemo.set(key, result);
    return result;
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const r = element.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return false;
    const s = getComputedStyle(element);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }

  function plausibleOverall(values) {
    for (const raw of values) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 35 && n <= 110) return n;
    }
    return null;
  }

  function findPlayerUi() {
    return measure('career-ui-detect', () => {
      for (const label of document.querySelectorAll('div,span,p,small')) {
        if (!visible(label) || label.closest(`[${UI_ATTR}]`)) continue;
        const text = norm(label.textContent).toUpperCase();
        if (text !== 'OVR' && !/^OVR\s*\d{2,3}$/.test(text)) continue;
        let node = label;
        for (let depth = 0; node && depth < 6 && node !== document.body; depth++, node = node.parentElement) {
          if (!visible(node)) continue;
          const r = node.getBoundingClientRect();
          if (r.width < 45 || r.width > 260 || r.height < 35 || r.height > 220) continue;
          const nums = norm(node.textContent).match(/\b\d{2,3}\b/g) || [];
          const overall = plausibleOverall(nums.reverse());
          if (overall != null) return { element: node, overall, source: 'tile' };
        }
      }

      // Firefox/React sometimes renders the OVR caption in a way that makes
      // element-level matching unreliable. Rendered text is a cheap fallback
      // and is only consulted on LI refresh events, never in a loop.
      const rendered = norm(document.body && document.body.innerText);
      const hasCareerAnchor = /נבחרת ישראל|בחר מועדון|הופעות/.test(rendered)
        && /שערים|בישולים|ריבאונדים|אסיסטים|תארים/.test(rendered);
      if (!hasCareerAnchor || !/\bOVR\b/i.test(rendered)) return null;
      const match = rendered.match(/\bOVR\s*(\d{2,3})\b/i);
      const overall = match ? plausibleOverall([match[1]]) : null;
      return { element: null, overall, source: 'text' };
    });
  }

  function careerContext() {
    const record = activeSaveRecord();
    if (!record) return { active: false, save: null, saveKey: null, creation: null, overall: null, uiSource: null };
    const playerUi = findPlayerUi();
    if (!playerUi) return { active: false, save: record.save, saveKey: record.key, creation: null, overall: null, uiSource: null };
    return {
      active: true,
      save: record.save,
      saveKey: record.key,
      creation: computeCreation(record.save.seed),
      overall: playerUi.overall,
      uiSource: playerUi.source,
    };
  }

  // ---------- Styles / HUD ----------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${HUD_ID}{position:fixed;z-index:1000000;display:inline-flex;align-items:center;gap:5px;min-height:31px;padding:5px 9px;border:1px solid rgba(74,222,128,.52);border-radius:999px;background:rgba(7,10,14,.92);color:#e5e7eb;box-shadow:0 4px 14px rgba(0,0,0,.28);backdrop-filter:blur(8px);box-sizing:border-box;font:850 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;direction:ltr;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
      #${HUD_ID} b{color:#4ade80;font:900 10px ui-monospace,SFMono-Regular,Consolas,monospace}#${HUD_ID} strong{color:#facc15;font-size:12px}#${HUD_ID}[data-hidden="1"]{opacity:.5;padding:5px 8px}
      #${HUD_ID}[data-layout="desktop"]{position:relative;z-index:2;display:flex;width:auto;min-height:30px;margin:0 10px 7px;padding:0 4px;border-color:rgba(148,163,184,.26);border-radius:9px;background:rgba(12,15,20,.82);box-shadow:none;direction:rtl;touch-action:auto;cursor:default;overflow:hidden}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-pot{display:inline-flex;align-items:baseline;gap:4px;padding:0 8px;direction:ltr;white-space:nowrap}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-pot b{font-size:9px}#${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-pot strong{font-size:12px}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-gap{color:#a3e635;font:800 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-sep{width:1px;height:14px;background:rgba(148,163,184,.25)}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-btn{align-self:stretch;min-width:0;border:0;background:transparent;color:#cbd5e1;padding:0 9px;font:750 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;cursor:pointer}
      #${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-btn:hover,#${HUD_ID}[data-layout="desktop"] .li-v8-toolbar-btn:focus-visible{background:rgba(74,222,128,.1);color:#86efac;outline:none}
      [${PREDICTED_ATTR}="1"]{outline:1px solid rgba(250,204,21,.78)!important;outline-offset:1px!important;box-shadow:inset 0 0 0 1px rgba(250,204,21,.12)!important}
      [${PREDICTION_MARKER_ATTR}]{display:inline-flex!important;align-items:center!important;flex:0 0 auto!important;margin-inline-start:5px!important;padding:2px 5px!important;border:1px solid rgba(250,204,21,.48)!important;border-radius:999px!important;background:rgba(113,63,18,.42)!important;color:#fde68a!important;font:850 8px/1 system-ui,-apple-system,Segoe UI,sans-serif!important;white-space:nowrap!important;pointer-events:none!important}
      [${BADGE_ATTR}]{position:absolute!important;left:7px!important;top:7px!important;z-index:5!important;display:block!important;width:auto!important;height:auto!important;margin:0!important;padding:3px 6px!important;border:1px solid rgba(148,163,184,.4)!important;border-radius:999px!important;background:rgba(10,13,18,.94)!important;color:#dbe3ee!important;box-sizing:border-box!important;pointer-events:none!important;white-space:nowrap!important;font:850 9px/1.05 system-ui,-apple-system,Segoe UI,sans-serif!important;direction:ltr!important;text-align:left!important;box-shadow:0 2px 8px rgba(0,0,0,.2)!important}
      .${BEST_CLASS}{outline:2px solid rgba(74,222,128,.45)!important;outline-offset:1px!important}.${BEST_CLASS} [${BADGE_ATTR}]{color:#86efac!important;border-color:rgba(74,222,128,.55)!important}
      .li-v8-overlay{position:fixed;inset:0;z-index:1000002;display:flex;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));background:rgba(0,0,0,.54)}
      .li-v8-sheet{width:min(440px,100%);max-height:min(86dvh,760px);overflow:auto;border:1px solid #3f4652;border-radius:18px;background:#0b0d12;color:#e5e7eb;box-shadow:0 18px 50px rgba(0,0,0,.52);padding:14px;direction:rtl;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;box-sizing:border-box}
      .li-v8-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}.li-v8-title{font-size:18px;font-weight:900}.li-v8-sub{margin-top:2px;color:#9ca3af;font-size:11px;font-weight:500}.li-v8-close{width:38px;height:38px;flex:0 0 38px;border:1px solid #475569;border-radius:10px;background:#191d25;color:#e5e7eb;font-size:21px;cursor:pointer}
      .li-v8-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.li-v8-btn{min-width:0;min-height:43px;border:1px solid #475569;border-radius:11px;background:#191d25;color:#f3f4f6;padding:8px 10px;font:800 12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;white-space:normal}.li-v8-btn[data-primary="1"]{background:#4ade80;color:#06250f;border-color:#4ade80}.li-v8-btn[data-danger="1"]{color:#fca5a5}.li-v8-btn:disabled{opacity:.5;cursor:default}
      .li-v8-card{border:1px solid #303641;border-radius:12px;background:#11151b;padding:10px;margin:8px 0}.li-v8-kv{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:baseline}.li-v8-kv span{color:#94a3b8;font-size:11px}.li-v8-kv strong{direction:ltr;text-align:left}.li-v8-highlight{color:#facc15}.li-v8-muted{color:#94a3b8;font-size:11px}.li-v8-status{min-height:20px;margin-top:9px;color:#94a3b8;font-size:11px}
      .li-v8-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.li-v8-field{display:flex;min-width:0;flex-direction:column;gap:4px;color:#aeb6c3;font-size:10px}.li-v8-field input,.li-v8-field select{width:100%;min-width:0;height:39px;border:1px solid #475569;border-radius:9px;background:#11151c;color:#f3f4f6;padding:0 9px;box-sizing:border-box;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif}.li-v8-actions{display:flex;gap:7px}.li-v8-actions .li-v8-btn{flex:1}.li-v8-results{display:grid;gap:7px;margin-top:8px}.li-v8-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #303641;border-radius:11px;background:#11151b;padding:9px}.li-v8-result-main{min-width:0;direction:ltr;text-align:left;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}.li-v8-result-main strong{color:#facc15;font-size:14px}.li-v8-seed{font-size:9px;color:#94a3b8;overflow-wrap:anywhere}
      .li-v8-agent{border-bottom:1px solid #252b34;padding:9px 0}.li-v8-agent:last-child{border-bottom:0}.li-v8-agent-name{font-weight:900}.li-v8-agent-meta{color:#aeb6c3;font-size:11px;margin-top:3px}.li-v8-agent-clubs{color:#86efac;font-size:11px;margin-top:4px}.li-v8-debug{direction:ltr;text-align:left;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}
      @media(min-width:700px){.li-v8-overlay{align-items:center}}@media(max-width:640px){[${BADGE_ATTR}]{font-size:8px!important;padding:2px 5px!important}[${PREDICTION_MARKER_ATTR}]{width:17px!important;height:17px!important;margin-inline-start:3px!important;padding:0!important;justify-content:center!important;font-size:0!important}[${PREDICTION_MARKER_ATTR}]::after{content:'🔮';font-size:9px}.li-v8-fields{grid-template-columns:1fr 1fr}.li-v8-fields .li-v8-field:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function readHudPos() {
    for (const key of [HUD_POS_KEY, OLD_HUD_POS_KEY]) {
      try {
        const p = JSON.parse(localStorage.getItem(key) || 'null');
        if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return p;
      } catch (e) {}
    }
    return null;
  }
  function writeHudPos(left, top) { try { localStorage.setItem(HUD_POS_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) })); } catch (e) {} }
  function clamp(el, left, top) {
    const r = el.getBoundingClientRect();
    return { left: Math.min(Math.max(4, left), Math.max(4, innerWidth - r.width - 4)), top: Math.min(Math.max(4, top), Math.max(4, innerHeight - r.height - 4)) };
  }
  function defaultHudPos(el) { return clamp(el, matchMedia('(max-width:640px)').matches ? 20 : 12, matchMedia('(max-width:640px)').matches ? 62 : 12); }

  function desktopLayout() {
    return innerWidth >= DESKTOP_MIN_WIDTH && matchMedia('(pointer:fine)').matches;
  }

  function desktopToolbarAnchor() {
    const player = document.querySelector('.board__player');
    return visible(player) ? player : null;
  }

  // ---------- Seed outcome preview ----------
  function predictionsEnabled() {
    try { return localStorage.getItem(PREDICTIONS_KEY) === '1'; }
    catch (e) { return false; }
  }

  function setPredictionsEnabled(value) {
    try { localStorage.setItem(PREDICTIONS_KEY, value ? '1' : '0'); } catch (e) {}
    if (value) decoratePredictions(); else clearPredictions();
  }

  function clearPrediction(card) {
    card.querySelectorAll(`[${PREDICTED_ATTR}]`).forEach((pill) => pill.removeAttribute(PREDICTED_ATTR));
    card.querySelectorAll(`[${PREDICTION_MARKER_ATTR}]`).forEach((marker) => marker.remove());
    delete card.dataset.liV8PredictionSignature;
  }

  function clearPredictions() {
    document.querySelectorAll('.decision .option--personal').forEach(clearPrediction);
  }

  function propsMatchVisibleCard(card, props) {
    const option = props && props.option;
    if (!option || !Array.isArray(option.outcomes) || option.outcomes.length < 2) return false;
    const visibleLabel = norm(card.querySelector('.option__name')?.textContent);
    if (!visibleLabel || norm(option.label) !== visibleLabel) return false;
    const pills = [...card.querySelectorAll('.pill')];
    if (pills.length !== option.outcomes.length) return false;
    return option.outcomes.every((outcome, index) => {
      const renderedResult = norm(pills[index]?.firstElementChild?.textContent);
      return renderedResult && renderedResult === norm(outcome && outcome.resultLabel);
    });
  }

  // This is deliberately not a tree scan. Start at one visible probabilistic
  // option card, use React's current DOM props to select the committed host
  // fiber, then walk only its bounded parent chain to the owning component.
  function decisionStepFromId(decisionId, seed) {
    const prefix = `${seed}-`;
    const id = String(decisionId || '');
    if (!id.startsWith(prefix)) return null;
    const match = id.slice(prefix.length).match(/^(\d+)-/);
    return match ? Number(match[1]) : null;
  }

  function localDecisionProps(card, cardIndex, records) {
    const pageDocument = typeof unsafeWindow !== 'undefined' ? unsafeWindow.document : null;
    const bridgedCard = pageDocument?.querySelectorAll('.decision .option--personal')[cardIndex];
    const candidates = [card.wrappedJSObject || card, bridgedCard?.wrappedJSObject || bridgedCard];
    let best = null;
    for (const pageCard of candidates) {
      if (!pageCard) continue;
      const keys = Object.keys(pageCard);
      const fiberKey = keys.find((name) => name.startsWith('__reactFiber$'));
      const propsKey = keys.find((name) => name.startsWith('__reactProps$'));
      const fiber = fiberKey ? pageCard[fiberKey] : null;
      const hostBranches = fiber?.alternate ? [fiber, fiber.alternate] : [fiber];
      const currentHostProps = propsKey ? pageCard[propsKey] : null;
      const currentBranches = currentHostProps
        ? hostBranches.filter((branch) => branch?.memoizedProps === currentHostProps || branch?.memoizedProps?.onClick === currentHostProps.onClick)
        : hostBranches;
      for (const root of currentBranches) {
        for (let branch = root, depth = 0; branch && depth < 8; depth++, branch = branch.return) {
          const props = branch.memoizedProps;
          if (!propsMatchVisibleCard(card, props)) continue;
          for (const record of records) {
            const step = decisionStepFromId(props.decision?.id, record.save.seed);
            if (!Number.isInteger(step)) continue;
            if (!best || step > best.step) best = { props, record, step };
          }
        }
      }
    }
    return best;
  }

  function predictedOutcome(seed, step, option) {
    if (!option || option.id == null || !Array.isArray(option.outcomes) || option.outcomes.length < 2) return null;
    const draw = Zl(Ks(`${seed}-${step}-apply-${option.id}`)).value;
    let cumulative = 0;
    for (let index = 0; index < option.outcomes.length; index++) {
      const probability = Number(option.outcomes[index] && option.outcomes[index].probability);
      if (!Number.isFinite(probability) || probability < 0) return null;
      cumulative += probability;
      if (draw < cumulative) return { index, draw };
    }
    return { index: option.outcomes.length - 1, draw };
  }

  function decoratePredictions() {
    if (!enabled() || !predictionsEnabled()) {
      if (document.querySelector(`[${PREDICTION_MARKER_ATTR}]`)) clearPredictions();
      return 0;
    }
    const records = activeSaveRecords();
    if (!records.length) { clearPredictions(); return 0; }
    let decorated = 0;
    const cards = document.querySelectorAll('.decision .option--personal');
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex];
      if (!visible(card) || !card.querySelector('.pill .num')) { clearPrediction(card); continue; }
      let context;
      try { context = localDecisionProps(card, cardIndex, records); } catch (e) { context = null; }
      const props = context?.props;
      const prediction = context ? predictedOutcome(context.record.save.seed, context.step, props.option) : null;
      const pills = [...card.querySelectorAll('.pill')];
      if (!prediction || pills.length !== props.option.outcomes.length || !pills[prediction.index]) { clearPrediction(card); continue; }
      const compact = innerWidth <= 640;
      const signature = `${props.decision.id}|${props.option.id}|${prediction.index}|${compact ? 'm' : 'd'}`;
      if (card.dataset.liV8PredictionSignature !== signature) {
        clearPrediction(card);
        const pill = pills[prediction.index];
        pill.setAttribute(PREDICTED_ATTR, '1');
        const marker = document.createElement('span');
        marker.setAttribute(PREDICTION_MARKER_ATTR, '1');
        marker.setAttribute(UI_ATTR, 'prediction');
        marker.setAttribute('title', 'זו התוצאה שה־seed הנוכחי יגריל');
        marker.setAttribute('aria-label', 'נקבע מראש לפי ה־seed');
        marker.textContent = '🔮 נקבע';
        pill.appendChild(marker);
        card.dataset.liV8PredictionSignature = signature;
      }
      decorated++;
    }
    return decorated;
  }

  function installDrag(el) {
    if (!el || el.dataset.liDrag === '1') return;
    el.dataset.liDrag = '1';
    let drag = null;
    let ignoreClickUntil = 0;
    el.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      const r = el.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
      try { el.setPointerCapture(event.pointerId); } catch (e) {}
    });
    el.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) <= 11) return;
      drag.moved = true;
      const p = clamp(el, drag.left + dx, drag.top + dy);
      el.style.setProperty('left', `${p.left}px`, 'important');
      el.style.setProperty('top', `${p.top}px`, 'important');
      event.preventDefault();
    });
    const finish = (event) => {
      if (!drag || (event.pointerId != null && drag.id !== event.pointerId)) return;
      if (drag.moved) {
        const r = el.getBoundingClientRect();
        writeHudPos(r.left, r.top);
        ignoreClickUntil = Date.now() + 350;
        event.preventDefault();
      }
      drag = null;
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('click', (event) => {
      if (Date.now() < ignoreClickUntil) { event.preventDefault(); event.stopPropagation(); return; }
      if (!enabled()) setEnabled(true);
      openMainSheet();
    });
  }

  function syncHud() {
    const context = careerContext();
    const toolbarAnchor = enabled() && context.active && desktopLayout() ? desktopToolbarAnchor() : null;
    const desktop = !!toolbarAnchor;
    const state = !enabled() ? 'hidden' : desktop
      ? `desktop:${context.creation.potential}:${context.overall ?? 'na'}`
      : context.active ? `pot:${context.creation.potential}` : 'plain';
    let hud = document.getElementById(HUD_ID);
    if (hud && hud.dataset.state === state) return;
    hud?.remove();
    hud = document.createElement(desktop ? 'div' : 'button');
    hud.id = HUD_ID;
    if (!desktop) hud.type = 'button';
    hud.setAttribute(UI_ATTR, 'hud');
    hud.dataset.state = state;
    if (!enabled()) { hud.dataset.hidden = '1'; hud.innerHTML = '<b>LI</b>'; }
    else if (desktop) {
      const gap = Number.isFinite(context.overall) ? context.creation.potential - context.overall : null;
      const gapHtml = gap == null ? '' : `<span class="li-v8-toolbar-gap">${gap >= 0 ? '+' : ''}${gap}</span>`;
      hud.dataset.layout = 'desktop';
      hud.setAttribute('role', 'toolbar');
      hud.setAttribute('aria-label', 'Legionnaire Insights');
      hud.innerHTML = `<span class="li-v8-toolbar-pot"><b>LI</b><span>POT <strong>${context.creation.potential}</strong></span>${gapHtml}</span><span class="li-v8-toolbar-sep" aria-hidden="true"></span><button class="li-v8-toolbar-btn" type="button" data-toolbar-action="details">פרטים</button><span class="li-v8-toolbar-sep" aria-hidden="true"></span><button class="li-v8-toolbar-btn" type="button" data-toolbar-action="seed">מצא סיד</button><span class="li-v8-toolbar-sep" aria-hidden="true"></span><button class="li-v8-toolbar-btn" type="button" data-toolbar-action="main">כלים / Sync</button>`;
    } else if (context.active) hud.innerHTML = `<b>LI</b><span>POT <strong>${context.creation.potential}</strong></span>`;
    else hud.innerHTML = '<b>LI</b>';
    if (desktop) {
      const trophyCase = toolbarAnchor.querySelector('.trophycase');
      toolbarAnchor.insertBefore(hud, trophyCase || null);
      hud.addEventListener('click', (event) => {
        const action = event.target.closest('[data-toolbar-action]')?.dataset.toolbarAction;
        if (action === 'details') openDetails();
        if (action === 'seed') openSeedFinder();
        if (action === 'main') openMainSheet();
      });
      return;
    }
    document.body.appendChild(hud);
    const saved = readHudPos();
    const p = saved ? clamp(hud, saved.left, saved.top) : defaultHudPos(hud);
    hud.style.setProperty('left', `${p.left}px`, 'important');
    hud.style.setProperty('top', `${p.top}px`, 'important');
    installDrag(hud);
  }

  // ---------- Club DB / annotations ----------
  function rebuildClubMaps(items, source) {
    clubItems = Array.isArray(items) ? items : [];
    const activeSport = sport();
    clubByName = new Map();
    clubById = new Map();
    const activeItems = clubItems.filter((item) => item && item.sport === activeSport);
    for (const item of activeItems) {
      if (!item || !item.name || !Number.isFinite(Number(item.ovr))) continue;
      clubById.set(item.id, item);
      const key = norm(item.name);
      if (key) clubByName.set(key, item);
    }
    for (const item of activeItems) {
      for (const alias of [item.shortName, ...(item.aliases || [])]) {
        const key = norm(alias);
        if (key && !clubByName.has(key)) clubByName.set(key, item);
      }
    }
    clubMapSport = activeSport;
    clubSource = source || '';
  }

  function ensureClubMapsForSport() {
    if (clubMapSport !== sport() && clubItems.length) rebuildClubMaps(clubItems, clubSource);
  }

  function detectedClubSport(parsed) {
    const sample = parsed.find((row) => Array.isArray(row) || (row && typeof row === 'object'));
    if (Array.isArray(sample)) {
      const country = String(sample[3] || '');
      if (/^[a-z]{2}$/.test(country)) return 'basketball';
      if (/^[A-Z]{2}$/.test(country)) return 'football';
      return null;
    }
    if (!sample) return null;
    if (sample.source && (sample.source.clubId != null || sample.source.rawName != null)) return 'football';
    if (sample.source && (sample.source.provider || sample.source.competitorId != null || sample.source.teamId != null)) return 'basketball';
    return null;
  }

  function loadCachedClubs() {
    try {
      const cache = JSON.parse(localStorage.getItem(CLUB_CACHE_KEY) || 'null');
      if (!cache || !Array.isArray(cache.items)) return;
      rebuildClubMaps(cache.items, cache.src || '');
    } catch (e) {}
  }

  async function ensureClubDb(force = false) {
    ensureClubMapsForSport();
    if (clubLoadPromise) return clubLoadPromise;
    const script = [...document.scripts].find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
    if (!script) return clubByName;
    if (!force && clubByName && clubByName.size && clubSource === script.src) return clubByName;
    clubLoadPromise = measureAsync('club-bundle-parse', async () => {
      try {
        const response = await fetch(script.src);
        if (!response.ok) return clubByName;
        const source = await response.text();
        const marker = 'JSON.parse(`';
        const itemsById = new Map();
        let from = 0;
        while (true) {
          const i = source.indexOf(marker, from);
          if (i === -1) break;
          const start = i + marker.length, end = source.indexOf('`)', start);
          if (end === -1) break;
          from = end + 2;
          try {
            const resolved = (0, eval)('`' + source.slice(start, end).replace(/`/g, '\\`') + '`');
            const parsed = JSON.parse(resolved);
            if (!Array.isArray(parsed)) continue;
            const parsedSport = detectedClubSport(parsed);
            if (!parsedSport) continue;
            for (const row of parsed) {
              let item = null;
              if (Array.isArray(row) && typeof row[0] === 'string') {
                item = { sport: parsedSport, id: row[0], name: row[1], shortName: row[2], league: row[4], ovr: Number(row[6]) };
              } else if (row && typeof row === 'object' && typeof row.id === 'string') {
                item = { sport: parsedSport, id: row.id, name: row.name, shortName: row.shortName, league: row.league, ovr: Number(row.baseOverall) };
              }
              if (item && item.name && Number.isFinite(item.ovr)) itemsById.set(`${parsedSport}:${item.id}`, item);
            }
          } catch (e) {}
        }
        if (!itemsById.size) return clubByName;
        const items = [...itemsById.values()];
        rebuildClubMaps(items, script.src);
        try { localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify({ src: script.src, items })); } catch (e) {}
        return clubByName;
      } finally { clubLoadPromise = null; }
    });
    return clubLoadPromise;
  }

  function ensureRelative(el) {
    if (getComputedStyle(el).position === 'static' && el.dataset.liV8Relative !== '1') {
      el.style.position = 'relative';
      el.dataset.liV8Relative = '1';
    }
  }

  function clearClubBadges() {
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((x) => x.remove());
    document.querySelectorAll(`[${CARD_ATTR}]`).forEach((card) => {
      card.removeAttribute(CARD_ATTR);
      card.classList.remove(BEST_CLASS);
      if (card.dataset.liV8Relative === '1') { card.style.removeProperty('position'); delete card.dataset.liV8Relative; }
    });
  }

  function clubInCard(card) {
    if (!clubByName) return null;
    for (const el of card.querySelectorAll('div,span,strong,h2,h3,h4,p')) {
      if (el.children.length || el.closest(`[${UI_ATTR}]`)) continue;
      const club = clubByName.get(norm(el.textContent));
      if (club) return club;
    }
    return null;
  }

  function decorateClubs() {
    return measure('club-dom-scan', () => {
      ensureClubMapsForSport();
      if (!enabled() || !clubByName || !clubByName.size) return 0;
      const found = [];
      const foundCards = new Set();
      for (const card of document.querySelectorAll('button,[role="button"]')) {
        if (!visible(card) || card.closest(`[${UI_ATTR}]`)) continue;
        const r = card.getBoundingClientRect();
        if (r.width < 105 || r.height < 65) continue;
        const club = clubInCard(card);
        if (!club) continue;
        found.push({ card, club });
        foundCards.add(card);
      }

      for (const card of document.querySelectorAll(`[${CARD_ATTR}]`)) {
        if (!card.isConnected || !foundCards.has(card)) {
          card.querySelectorAll(`[${BADGE_ATTR}]`).forEach((x) => x.remove());
          card.removeAttribute(CARD_ATTR);
          card.classList.remove(BEST_CLASS);
          if (card.dataset.liV8Relative === '1') { card.style.removeProperty('position'); delete card.dataset.liV8Relative; }
        }
      }

      if (found.length < 2) return found.length;
      const best = Math.max(...found.map((x) => x.club.ovr));
      for (const { card, club } of found) {
        ensureRelative(card);
        card.setAttribute(CARD_ATTR, '1');
        card.classList.toggle(BEST_CLASS, club.ovr === best);
        let badge = card.querySelector(`:scope > [${BADGE_ATTR}]`);
        if (!badge) {
          badge = document.createElement('span');
          badge.setAttribute(BADGE_ATTR, '1');
          badge.setAttribute(UI_ATTR, 'badge');
          card.appendChild(badge);
        }
        const text = `OVR ${club.ovr}`;
        if (badge.textContent !== text) badge.textContent = text;
      }
      return found.length;
    });
  }

  function scheduleUiBurst() {
    uiTimers.forEach(clearTimeout);
    uiTimers = [];
    // Real-device diagnostics showed a club pass costs ~1–2ms. React can finish
    // replacing decision cards well after 350ms, so use sparse retries across
    // 2.4s instead of a continuous observer/poller.
    for (const delay of [60, 180, 420, 850, 1500, 2400]) {
      uiTimers.push(setTimeout(() => { syncHud(); decorateClubs(); decoratePredictions(); }, delay));
    }
  }

  // ---------- Sheets ----------
  function closeSheet() { document.getElementById(SHEET_ID)?.remove(); }

  function sheet(title, subtitle, bodyHtml) {
    closeSheet();
    const overlay = document.createElement('div');
    overlay.id = SHEET_ID;
    overlay.className = 'li-v8-overlay';
    overlay.setAttribute(UI_ATTR, 'sheet');
    overlay.innerHTML = `<div class="li-v8-sheet" role="dialog" aria-modal="true"><div class="li-v8-head"><div><div class="li-v8-title">${esc(title)}</div><div class="li-v8-sub">${subtitle || ''}</div></div><button class="li-v8-close" type="button" data-close>×</button></div><div data-body>${bodyHtml}</div></div>`;
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-close]')) closeSheet(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function openMainSheet() {
    const context = careerContext();
    const showPredictions = predictionsEnabled();
    const subtitle = context.active
      ? `POT ${context.creation.potential} · OVR ${context.overall ?? '—'} · ${context.creation.developmentProfile}`
      : 'כלים והגדרות';
    const overlay = sheet('Legionnaire Insights', subtitle,
      `<div class="li-v8-grid"><button class="li-v8-btn" data-action="details">פרטים</button><button class="li-v8-btn" data-primary="1" data-action="seed">מצא סיד</button><button class="li-v8-btn" data-action="agents">סוכנים</button><button class="li-v8-btn" data-action="sync">Sync / Settings</button><button class="li-v8-btn" ${showPredictions ? 'data-primary="1"' : ''} data-action="predictions">תחזית: ${showPredictions ? 'פעילה' : 'כבויה'}</button></div><div class="li-v8-status">🔮 התחזית מסמנת את התוצאה שה־seed יגריל. היא אינה משנה את המשחק או את השמירה.</div>`);
    overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'details') openDetails();
      if (action === 'seed') openSeedFinder();
      if (action === 'agents') openAgents();
      if (action === 'sync') openSyncSettings();
      if (action === 'predictions') { setPredictionsEnabled(!predictionsEnabled()); openMainSheet(); }
    });
  }

  function openDetails() {
    const c = careerContext();
    if (!c.active) {
      sheet('פרטים', 'אין קריירה פעילה במסך הנוכחי', '<div class="li-v8-card li-v8-muted">לא נמצא כרגע מסך שחקן פעיל. Seed Finder ו־Sync זמינים גם מחוץ לקריירה.</div>');
      return;
    }
    const gap = Number.isFinite(c.overall) ? c.creation.potential - c.overall : null;
    const age = c.save && (c.save.age ?? c.save.currentAge);
    const position = c.save && c.save.position;
    sheet('פרטי שחקן', 'מידע מחושב מה־save ומהמסך בלבד — בלי סריקת React',
      `<div class="li-v8-card"><div class="li-v8-kv"><span>Potential</span><strong class="li-v8-highlight">${c.creation.potential}</strong><span>OVR נוכחי</span><strong>${c.overall ?? '—'}</strong><span>פער</span><strong>${gap == null ? '—' : (gap >= 0 ? '+' : '') + gap}</strong><span>Development</span><strong>${esc(c.creation.developmentProfile)}</strong><span>Starting OVR</span><strong>${c.creation.startingOverall}</strong>${age != null ? `<span>גיל</span><strong>${esc(age)}</strong>` : ''}${position ? `<span>עמדה</span><strong>${esc(position)}</strong>` : ''}</div></div>`);
  }

  async function openAgents() {
    const overlay = sheet('סוכנים', 'מידע קבוע — נטען רק כשפותחים את המסך', '<div data-agents class="li-v8-card li-v8-muted">טוען…</div>');
    await ensureClubDb();
    if (!document.body.contains(overlay)) return;
    const container = overlay.querySelector('[data-agents]');
    container.className = 'li-v8-card';
    container.innerHTML = AGENTS.map((a) => {
      const clubs = (a.clubIds || []).map((id) => clubById && clubById.get(id)).filter(Boolean).map((c) => c.name);
      return `<div class="li-v8-agent"><div class="li-v8-agent-name">${esc(a.name)} <span class="li-v8-muted">(${esc(a.type)})</span></div><div class="li-v8-agent-meta">${esc(a.condition)} · ${esc(a.bonus)}</div>${clubs.length ? `<div class="li-v8-agent-clubs">מועדפים: ${clubs.map(esc).join(' · ')}</div>` : ''}</div>`;
    }).join('');
  }

  // ---------- Seed Finder ----------
  function readSeedPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(SEED_PREFS_KEY) || '{}');
      return { potential: Number(p.potential) || 94, overall: Number(p.overall) || 76, profile: ['any','early','normal','late'].includes(p.profile) ? p.profile : 'normal' };
    } catch (e) { return { potential: 94, overall: 76, profile: 'normal' }; }
  }
  function stopSeedWorker() { if (seedWorker) { try { seedWorker.terminate(); } catch (e) {} seedWorker = null; } }
  function seedWorkerSource() {
    return `function h(t){let r=2166136261>>>0;for(let i=0;i<t.length;i++){r^=t.charCodeAt(i);r=Math.imul(r,16777619)}return r>>>0}function k(s){return{seed:s,state:h(s)||1}}function z(r){const s=(r.state+1831565813)>>>0;let n=s;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return{rng:{seed:r.seed,state:s},value:((n^(n>>>14))>>>0)/4294967296}}function x(r,l,h){const n=z(r);return{rng:n.rng,value:l+n.value*(h-l)}}function q(r,l,h){const n=z(r);return{rng:n.rng,value:l+Math.floor(n.value*(h-l+1))}}function v(r,p){const n=z(r);return{rng:n.rng,value:n.value<p}}function m(r){const n=z(r);return{rng:n.rng,value:n.value<.1?'early':n.value<.2?'late':'normal'}}function c(seed){let r=k(seed);const e=v(r,.1);r=e.rng;const b=e.value?[66,76]:[46,52];const o=q(r,b[0],b[1]);r=o.rng;const p=m(r);r=p.rng;const a=x(r,0,1),A=a.value;let pot;if(A<.12)pot=62+(A/.12)*13;else if(A<.85)pot=75+((A-.12)/.73)*9;else pot=84+((A-.85)/.15)*9;const no=x(a.rng,-1,1);pot=Math.max(o.value+4,Math.min(96,Math.round(pot+no.value)));return{elite:e.value,startingOverall:o.value,developmentProfile:p.value,potential:pot}}function g(){const c='abcdefghijklmnopqrstuvwxyz0123456789',p=n=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');return p(8)+'-'+p(8)}onmessage=e=>{const a=e.data;let t=0,f=0;while(t<500000&&f<8){const s=g(),r=c(s);t++;if(r.potential===a.potential&&r.startingOverall===a.overall&&(a.profile==='any'||r.developmentProfile===a.profile)){f++;postMessage({type:'result',seed:s,result:r,tries:t,found:f})}if(t%25000===0)postMessage({type:'progress',tries:t,found:f})}postMessage({type:'done',tries:t,found:f})}`;
  }

  function applySeed(seed) {
    const key = activeSaveKey();
    const current = activeSave() || {};
    const template = {
      lastName: current.lastName ?? 'Player', number: current.number ?? 10, foot: current.foot ?? 'right',
      position: current.position ?? 'ST', cadence: current.cadence ?? 'intense', ...(sport() === 'basketball' ? { height: current.height ?? 190 } : {}),
    };
    try {
      localStorage.setItem(key, JSON.stringify({ ...template, seed, choices: [] }));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }

  function appendSeedResult(container, seed, result) {
    const row = document.createElement('div');
    row.className = 'li-v8-result';
    row.innerHTML = `<div class="li-v8-result-main"><strong>POT ${result.potential}</strong> · OVR ${result.startingOverall} · ${esc(result.developmentProfile)}<div class="li-v8-seed">${esc(seed)}</div></div><button class="li-v8-btn" data-primary="1" type="button">השתמש</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (!confirm('להתחיל קריירה חדשה עם הסיד הזה? הקריירה הפעילה תוחלף.')) return;
      applySeed(seed);
    });
    container.appendChild(row);
  }

  function runSeedSearch(overlay) {
    stopSeedWorker();
    const query = {
      potential: Number(overlay.querySelector('[data-pot]').value) || 94,
      overall: Number(overlay.querySelector('[data-ovr]').value) || 76,
      profile: overlay.querySelector('[data-profile]').value,
    };
    try { localStorage.setItem(SEED_PREFS_KEY, JSON.stringify(query)); } catch (e) {}
    const status = overlay.querySelector('[data-status]');
    const results = overlay.querySelector('[data-results]');
    results.innerHTML = '';
    status.textContent = 'מחפש…';
    try {
      const url = URL.createObjectURL(new Blob([seedWorkerSource()], { type: 'text/javascript' }));
      seedWorker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      seedWorker.onmessage = (event) => {
        const msg = event.data || {};
        if (!document.body.contains(overlay)) { stopSeedWorker(); return; }
        if (msg.type === 'result') appendSeedResult(results, msg.seed, msg.result);
        if (msg.type === 'result' || msg.type === 'progress') status.textContent = `נבדקו ${Number(msg.tries || 0).toLocaleString()} · נמצאו ${msg.found || 0}`;
        if (msg.type === 'done') { status.textContent = `הסתיים · נמצאו ${msg.found || 0}`; stopSeedWorker(); }
      };
      seedWorker.onerror = () => { status.textContent = 'Worker לא זמין בדפדפן הזה.'; stopSeedWorker(); };
      seedWorker.postMessage(query);
    } catch (e) { status.textContent = 'Worker לא זמין בדפדפן הזה.'; }
  }

  function openSeedFinder() {
    stopSeedWorker();
    const p = readSeedPrefs();
    const overlay = sheet('מציאת סיד', 'החיפוש רץ ב־Web Worker ולא חוסם את המשחק',
      `<div class="li-v8-fields"><label class="li-v8-field">Potential<input data-pot type="number" min="50" max="96" value="${p.potential}"></label><label class="li-v8-field">Starting OVR<input data-ovr type="number" min="40" max="90" value="${p.overall}"></label><label class="li-v8-field">Development<select data-profile><option value="any">כל פרופיל</option><option value="early">early</option><option value="normal">normal</option><option value="late">late</option></select></label></div><div class="li-v8-actions"><button class="li-v8-btn" data-primary="1" data-search>חפש</button><button class="li-v8-btn" data-stop>עצור</button></div><div class="li-v8-status" data-status>בחר ערכים ולחץ חיפוש.</div><div class="li-v8-results" data-results></div>`);
    overlay.querySelector('[data-profile]').value = p.profile;
    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-search]')) runSeedSearch(overlay);
      if (event.target.closest('[data-stop]')) { stopSeedWorker(); overlay.querySelector('[data-status]').textContent = 'נעצר.'; }
    });
  }

  function maybeAutoContinue() {
    let flag;
    try { flag = localStorage.getItem(AUTO_CONTINUE_KEY); } catch (e) { return; }
    if (!flag) return;
    let attempts = 0;
    const tick = () => {
      attempts++;
      const button = [...document.querySelectorAll('button,[role="button"]')].find((el) => norm(el.textContent) === 'המשך קריירה קיימת');
      if (button) {
        try { localStorage.removeItem(AUTO_CONTINUE_KEY); } catch (e) {}
        button.click();
      } else if (attempts < 18) setTimeout(tick, 250);
      else { try { localStorage.removeItem(AUTO_CONTINUE_KEY); } catch (e) {} }
    };
    setTimeout(tick, 180);
  }

  // ---------- Sync merge primitives (v7 snapshot compatible) ----------
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(DEVICE_ID_KEY, id); }
    return id;
  }
  function getLedgerMeta() { return readJson(LEDGER_META_KEY, { numbers: {}, maps: {} }) || { numbers: {}, maps: {} }; }
  function saveLedgerMeta(meta) { localStorage.setItem(LEDGER_META_KEY, JSON.stringify(meta)); }

  function mergeNumberKey(key, remoteLedger) {
    const myId = getDeviceId();
    const meta = getLedgerMeta();
    const entry = meta.numbers[key] || { ledger: {}, lastWritten: 0 };
    const current = Number(localStorage.getItem(key) || '0');
    const delta = current - Number(entry.lastWritten || 0);
    entry.ledger[myId] = (entry.ledger[myId] || 0) + Math.max(0, delta);
    for (const [devId, val] of Object.entries(remoteLedger || {})) if (devId !== myId) entry.ledger[devId] = Math.max(entry.ledger[devId] || 0, Number(val) || 0);
    const total = Object.values(entry.ledger).reduce((a, b) => a + (Number(b) || 0), 0);
    localStorage.setItem(key, String(total));
    entry.lastWritten = total;
    meta.numbers[key] = entry;
    saveLedgerMeta(meta);
    return entry.ledger;
  }

  function flattenNums(obj, prefix = '', out = {}) {
    for (const key of Object.keys(obj || {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (typeof value === 'number') out[path] = value;
      else if (value && typeof value === 'object') flattenNums(value, path, out);
    }
    return out;
  }
  function unflattenNums(flat) {
    const out = {};
    for (const [path, value] of Object.entries(flat)) {
      const parts = path.split('.');
      let node = out;
      for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
      node[parts[parts.length - 1]] = value;
    }
    return out;
  }
  function mergeMapKey(key, remoteLedger) {
    const myId = getDeviceId();
    const meta = getLedgerMeta();
    const entry = meta.maps[key] || { ledger: {}, lastWritten: {} };
    const currentFlat = flattenNums(readJson(key, {}));
    for (const leaf of Object.keys(currentFlat)) {
      const leafEntry = entry.ledger[leaf] || {};
      const delta = Number(currentFlat[leaf] || 0) - Number(entry.lastWritten[leaf] || 0);
      leafEntry[myId] = (leafEntry[myId] || 0) + Math.max(0, delta);
      entry.ledger[leaf] = leafEntry;
    }
    for (const [leaf, devMap] of Object.entries(remoteLedger || {})) {
      const leafEntry = entry.ledger[leaf] || {};
      for (const [devId, val] of Object.entries(devMap || {})) if (devId !== myId) leafEntry[devId] = Math.max(leafEntry[devId] || 0, Number(val) || 0);
      entry.ledger[leaf] = leafEntry;
    }
    const totals = {};
    for (const [leaf, devMap] of Object.entries(entry.ledger)) totals[leaf] = Object.values(devMap).reduce((a, b) => a + (Number(b) || 0), 0);
    localStorage.setItem(key, JSON.stringify(unflattenNums(totals)));
    entry.lastWritten = totals;
    meta.maps[key] = entry;
    saveLedgerMeta(meta);
    return entry.ledger;
  }

  function unionBySeed(a, b) {
    const map = new Map();
    for (const item of a || []) map.set(item && item.seed != null ? item.seed : JSON.stringify(item), item);
    for (const item of b || []) {
      const key = item && item.seed != null ? item.seed : JSON.stringify(item);
      if (!map.has(key)) map.set(key, item);
    }
    return [...map.values()];
  }

  function chooseActiveSave(targetRaw, sourceRaw) {
    if (!targetRaw) return sourceRaw;
    if (!sourceRaw || targetRaw === sourceRaw) return targetRaw;
    try {
      const target = JSON.parse(targetRaw), source = JSON.parse(sourceRaw);
      if (target && source && target.seed === source.seed) {
        const a = Array.isArray(target.choices) ? target.choices.length : 0;
        const b = Array.isArray(source.choices) ? source.choices.length : 0;
        return b > a ? sourceRaw : targetRaw;
      }
    } catch (e) {}
    return targetRaw;
  }

  function exportPayload() {
    return measure('sync-export-build', () => {
      const ledgers = { numbers: {}, maps: {} };
      for (const key of SUM_NUMBER_KEYS) if (localStorage.getItem(key) != null) ledgers.numbers[key] = mergeNumberKey(key);
      for (const key of SUM_MAP_KEYS) if (localStorage.getItem(key) != null) ledgers.maps[key] = mergeMapKey(key);
      const skip = new Set([...SUM_NUMBER_KEYS, ...SUM_MAP_KEYS, ...SYNC_EXCLUDE, LEDGER_META_KEY, DEVICE_ID_KEY, OLD_BASELINE_KEY]);
      const data = {};
      for (const key of Object.keys(localStorage)) if (key.startsWith('maslul-kariera') && !skip.has(key)) data[key] = localStorage.getItem(key);
      return { __legSync: 2, ts: Date.now(), ledgers, data };
    });
  }

  function importPayload(payload) {
    if (!payload || payload.__legSync !== 2) throw new Error('Invalid sync payload');
    let changed = false;
    for (const [key, remoteLedger] of Object.entries((payload.ledgers && payload.ledgers.numbers) || {})) {
      const before = localStorage.getItem(key); mergeNumberKey(key, remoteLedger); if (localStorage.getItem(key) !== before) changed = true;
    }
    for (const [key, remoteLedger] of Object.entries((payload.ledgers && payload.ledgers.maps) || {})) {
      const before = localStorage.getItem(key); mergeMapKey(key, remoteLedger); if (localStorage.getItem(key) !== before) changed = true;
    }
    for (const [key, sourceRaw] of Object.entries(payload.data || {})) {
      const targetRaw = localStorage.getItem(key);
      let selected = targetRaw;
      if (UNION_ARRAY_KEYS.has(key)) selected = JSON.stringify(unionBySeed(targetRaw ? JSON.parse(targetRaw) : [], sourceRaw ? JSON.parse(sourceRaw) : []));
      else if (ACTIVE_SAVE_KEYS.has(key)) selected = chooseActiveSave(targetRaw, sourceRaw);
      else if (!targetRaw) selected = sourceRaw;
      if (selected != null && selected !== targetRaw) { localStorage.setItem(key, selected); changed = true; }
    }
    return changed;
  }

  // ---------- Snapshot transport ----------
  function hash32(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
  async function sha256Hex(text) {
    if (!(globalThis.crypto && crypto.subtle)) return hash32(text);
    const bytes = new TextEncoder().encode(text);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function bytesToBase64(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
  function base64ToBytes(text) { const binary = atob(text), bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
  async function encodeSnapshotText(text) {
    if (typeof CompressionStream !== 'function') return { encoding: 'plain-base64', data: bytesToBase64(new TextEncoder().encode(text)) };
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { encoding: 'gzip-base64', data: bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer())) };
  }
  async function decodeSnapshotText(wrapper) {
    const bytes = base64ToBytes(wrapper.data || '');
    if (wrapper.encoding === 'plain-base64') return new TextDecoder().decode(bytes);
    if (wrapper.encoding !== 'gzip-base64' || typeof DecompressionStream !== 'function') throw new Error(`Unsupported snapshot encoding: ${wrapper.encoding}`);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  async function packSnapshot(payload, deviceId) {
    const text = JSON.stringify(payload), encoded = await encodeSnapshotText(text);
    return JSON.stringify({ schema: 3, deviceId, updatedAt: Date.now(), stateHash: await sha256Hex(JSON.stringify({ ...payload, ts: 0 })), payloadHash: await sha256Hex(text), encoding: encoded.encoding, data: encoded.data });
  }
  async function unpackSnapshot(content) {
    const wrapper = JSON.parse(content);
    if (!wrapper || wrapper.schema !== 3 || !wrapper.data) throw new Error('Invalid v3 snapshot');
    const text = await decodeSnapshotText(wrapper);
    if (wrapper.payloadHash && await sha256Hex(text) !== wrapper.payloadHash) throw new Error('Snapshot checksum mismatch');
    const payload = JSON.parse(text);
    if (!payload || payload.__legSync !== 2) throw new Error('Invalid payload inside snapshot');
    return { wrapper, payload };
  }

  function request(method, url, token, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url,
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 30000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) { try { resolve(JSON.parse(res.responseText)); } catch (e) { resolve(null); } }
          else if (res.status === 401) { const err = new Error('401'); err.auth = true; reject(err); }
          else reject(new Error(`GitHub API ${res.status}: ${String(res.responseText || '').slice(0, 160)}`));
        },
        onerror: () => reject(new Error('Network error contacting GitHub')),
        ontimeout: () => reject(new Error('GitHub request timed out')),
      });
    });
  }
  function rawRequest(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({ method: 'GET', url, headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' }, timeout: 30000,
        onload: (res) => { if (res.status >= 200 && res.status < 300) resolve(res.responseText); else if (res.status === 404) resolve(null); else reject(new Error(`Raw fetch ${res.status}`)); },
        onerror: () => reject(new Error('Network error fetching snapshot')), ontimeout: () => reject(new Error('Snapshot request timed out')) });
    });
  }
  function bust(url) { return `${url}${url.includes('?') ? '&' : '?'}_ts=${Date.now()}${Math.random().toString(36).slice(2)}`; }

  function getStoredToken() {
    let token = GM_getValue(GH_TOKEN_GM_KEY, '');
    if (!token) {
      try { token = localStorage.getItem(LEGACY_GH_TOKEN_KEY) || ''; if (token) { GM_setValue(GH_TOKEN_GM_KEY, token); localStorage.removeItem(LEGACY_GH_TOKEN_KEY); } } catch (e) {}
    }
    return token;
  }
  function promptToken(reason = '') {
    const token = prompt(`${reason ? reason + '\n\n' : ''}Paste a GitHub personal access token with Gists: Read and write.`);
    if (!token) return null;
    GM_setValue(GH_TOKEN_GM_KEY, token.trim());
    return token.trim();
  }
  async function api(method, url, body, allowPrompt = true) {
    let token = getStoredToken();
    if (!token && allowPrompt) token = promptToken();
    if (!token) throw new Error('No GitHub token configured');
    try { return await request(method, url, token, body); }
    catch (e) {
      if (e.auth && allowPrompt) {
        GM_deleteValue(GH_TOKEN_GM_KEY);
        token = promptToken('GitHub rejected the saved token.');
        if (!token) throw new Error('No valid GitHub token configured');
        return await request(method, url, token, body);
      }
      throw e;
    }
  }

  async function readSnapshotFile(file) {
    if (file && typeof file.content === 'string' && !file.truncated) return file.content;
    if (file && file.raw_url) return await rawRequest(bust(file.raw_url));
    return null;
  }
  async function getDeviceSnapshots(gist) {
    const result = [];
    for (const [filename, file] of Object.entries((gist && gist.files) || {})) {
      if (!filename.startsWith(DEVICE_FILE_PREFIX) || !filename.endsWith(DEVICE_FILE_SUFFIX)) continue;
      try { const content = await readSnapshotFile(file); if (content) result.push({ filename, ...(await unpackSnapshot(content)) }); }
      catch (e) { console.warn(`Legionnaire Insights: ignored ${filename}`, e); }
    }
    return result;
  }
  function safeObj(text) { try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; } }
  async function pullLegacyPayload() {
    const chunks = {};
    for (const filename of Object.values(LEGACY_GIST_FILES)) {
      try { chunks[filename] = await rawRequest(bust(`https://gist.githubusercontent.com/${GIST_OWNER}/${GIST_ID}/raw/${filename}`)); } catch (e) { chunks[filename] = null; }
    }
    if (!chunks[LEGACY_GIST_FILES.meta]) return null;
    const meta = safeObj(chunks[LEGACY_GIST_FILES.meta]);
    const data = safeObj(chunks[LEGACY_GIST_FILES.other]);
    if (chunks[LEGACY_GIST_FILES.careersFootball] != null) data[PER_SPORT_KEYS.football.careers] = chunks[LEGACY_GIST_FILES.careersFootball];
    if (chunks[LEGACY_GIST_FILES.careersBasketball] != null) data[PER_SPORT_KEYS.basketball.careers] = chunks[LEGACY_GIST_FILES.careersBasketball];
    return { __legSync: meta.__legSync || 2, ts: meta.ts || Date.now(), ledgers: { numbers: safeObj(chunks[LEGACY_GIST_FILES.numbers]), maps: { [PER_SPORT_KEYS.football.collection]: safeObj(chunks[LEGACY_GIST_FILES.mapFootball]), [PER_SPORT_KEYS.basketball.collection]: safeObj(chunks[LEGACY_GIST_FILES.mapBasketball]) } }, data };
  }

  async function pullAndMerge() {
    if (!getStoredToken()) return { changed: false, skipped: true };
    return measureAsync('sync-pull', async () => {
      const gist = await api('GET', `https://api.github.com/gists/${GIST_ID}`, null, false);
      const snapshots = await getDeviceSnapshots(gist);
      let changed = false;
      if (snapshots.length) for (const snapshot of snapshots) if (importPayload(snapshot.payload)) changed = true;
      else { const legacy = await pullLegacyPayload(); if (legacy && importPayload(legacy)) changed = true; }
      GM_setValue(LAST_PULL_GM_KEY, Date.now());
      return { changed, snapshots: snapshots.length };
    });
  }

  async function pushOwnSnapshot(reason = 'manual') {
    return measureAsync('sync-push', async () => {
      const payload = exportPayload(), deviceId = getDeviceId(), filename = `${DEVICE_FILE_PREFIX}${deviceId}${DEVICE_FILE_SUFFIX}`;
      const packed = await packSnapshot(payload, deviceId);
      await api('PATCH', `https://api.github.com/gists/${GIST_ID}`, { files: { [filename]: { content: packed } } }, reason === 'manual');
      GM_setValue(LAST_PUSH_GM_KEY, Date.now());
      return { bytes: packed.length };
    });
  }

  async function manualSync(statusEl) {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      try {
        statusEl.textContent = 'מוריד וממזג…';
        const pulled = await pullAndMerge();
        statusEl.textContent = 'מעלה snapshot של המכשיר…';
        const pushed = await pushOwnSnapshot('manual');
        statusEl.textContent = `הסתיים ✓ · ${(pushed.bytes / 1024).toFixed(1)}KB${pulled.changed ? ' · התקבלו שינויים מהענן' : ''}`;
        if (pulled.changed) {
          const button = document.createElement('button'); button.className = 'li-v8-btn'; button.textContent = 'טען מחדש כדי לראות שינויים'; button.style.marginTop = '8px';
          button.addEventListener('click', () => location.reload()); statusEl.appendChild(document.createElement('br')); statusEl.appendChild(button);
        }
      } catch (e) { statusEl.textContent = `Sync נכשל: ${String(e.message || e)}`; }
      finally { syncInFlight = null; }
    })();
    return syncInFlight;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok;
  }
  async function exportManual(status) {
    try { const text = JSON.stringify(exportPayload()), ok = await copyText(text); status.textContent = ok ? `הועתק ללוח · ${(text.length / 1024).toFixed(1)}KB` : 'לא הצלחתי להעתיק אוטומטית.'; if (!ok) prompt('Copy this sync payload:', text); }
    catch (e) { status.textContent = `Export נכשל: ${String(e.message || e)}`; }
  }
  function importManual(status) {
    const text = prompt('Paste exported Legionnaire Insights sync data:');
    if (!text) return;
    try { const changed = importPayload(JSON.parse(text)); status.textContent = changed ? 'Import הושלם. טען מחדש את המשחק.' : 'Import הושלם ללא שינויים.'; }
    catch (e) { status.textContent = `Import נכשל: ${String(e.message || e)}`; }
  }

  // ---------- Update awareness / settings ----------
  function currentVersion() { return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || VERSION; }
  function compareVersions(a, b) {
    const x = String(a).split('.').map((n) => Number(n) || 0), y = String(b).split('.').map((n) => Number(n) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  }
  function checkUpdate(force = false) {
    const last = Number(GM_getValue(UPDATE_LAST_CHECK_GM_KEY, 0)) || 0;
    if (!force && Date.now() - last < 60 * 60 * 1000) return Promise.resolve(latestScriptVersion);
    return new Promise((resolve) => {
      GM_xmlhttpRequest({ method: 'GET', url: `${SCRIPT_UPDATE_URL}?v=${Date.now()}`, timeout: 15000,
        onload: (res) => { const match = res.status >= 200 && res.status < 300 ? res.responseText.match(/^\/\/ @version\s+([^\s]+)$/m) : null; if (match) { latestScriptVersion = match[1]; GM_setValue(UPDATE_LATEST_GM_KEY, latestScriptVersion); GM_setValue(UPDATE_LAST_CHECK_GM_KEY, Date.now()); } resolve(latestScriptVersion); },
        onerror: () => resolve(latestScriptVersion), ontimeout: () => resolve(latestScriptVersion) });
    });
  }
  function formatTime(value) { const n = Number(value) || 0; return n ? new Date(n).toLocaleString() : 'אף פעם'; }

  function debugReport() {
    const record = activeSaveRecord();
    const context = careerContext();
    const lines = [
      `Legionnaire Insights ${VERSION}`,
      `viewport ${innerWidth}x${innerHeight} DPR ${devicePixelRatio}`,
      `save-key: ${record ? record.key : 'none'}`,
      `career-ui: ${context.active ? `yes (${context.uiSource}, OVR ${context.overall ?? '?'})` : 'no'}`,
      `club-db: ${clubByName ? clubByName.size : 0} aliases / ${clubById ? clubById.size : 0} clubs`,
      '',
    ];
    for (const [name, row] of timings.entries()) lines.push(`${name}: count=${row.count} avg=${(row.total / row.count).toFixed(1)}ms max=${row.max.toFixed(1)}ms last=${row.last.toFixed(1)}ms`);
    return lines.join('\n');
  }

  function openSyncSettings() {
    const hasToken = !!getStoredToken();
    const updateAvailable = latestScriptVersion && compareVersions(latestScriptVersion, currentVersion()) > 0;
    const overlay = sheet('Sync / Settings', 'אין sync בזמן משחק. Pull בתחילת סשן; Push אוטומטי רק אחרי פרישה.',
      `<div class="li-v8-grid"><button class="li-v8-btn" data-primary="1" data-sync>Sync עכשיו</button><button class="li-v8-btn" data-token>${hasToken ? 'החלף Token' : 'הגדר Token'}</button><button class="li-v8-btn" data-export>Export</button><button class="li-v8-btn" data-import>Import</button><button class="li-v8-btn" data-update>בדוק עדכון</button><button class="li-v8-btn" data-hide data-danger="1">הסתר LI</button></div><div class="li-v8-card"><div class="li-v8-kv"><span>Pull אחרון</span><strong>${esc(formatTime(GM_getValue(LAST_PULL_GM_KEY, 0)))}</strong><span>Push אחרון</span><strong>${esc(formatTime(GM_getValue(LAST_PUSH_GM_KEY, 0)))}</strong><span>גרסה</span><strong>${esc(currentVersion())}${updateAvailable ? ` → ${esc(latestScriptVersion)}` : ''}</strong></div></div><div class="li-v8-status" data-status>${hasToken ? 'Cloud sync מוכן.' : 'Cloud sync לא מוגדר במכשיר הזה.'}</div><div class="li-v8-card"><button class="li-v8-btn" data-debug>${localStorage.getItem(DEBUG_KEY) === '1' ? 'הסתר Debug' : 'הצג Debug'}</button><pre class="li-v8-debug" data-debug-body style="display:${localStorage.getItem(DEBUG_KEY) === '1' ? 'block' : 'none'}">${esc(debugReport())}</pre></div>`);
    const status = overlay.querySelector('[data-status]');
    overlay.addEventListener('click', async (event) => {
      if (event.target.closest('[data-sync]')) manualSync(status);
      if (event.target.closest('[data-token]')) { const t = promptToken('Token חדש יחליף את הקיים.'); status.textContent = t ? 'Token נשמר.' : 'לא בוצע שינוי.'; }
      if (event.target.closest('[data-export]')) exportManual(status);
      if (event.target.closest('[data-import]')) importManual(status);
      if (event.target.closest('[data-hide]')) setEnabled(false);
      if (event.target.closest('[data-update]')) { status.textContent = 'בודק…'; await checkUpdate(true); status.textContent = latestScriptVersion && compareVersions(latestScriptVersion, currentVersion()) > 0 ? `קיימת גרסה ${latestScriptVersion}` : `מעודכן · ${currentVersion()}`; }
      if (event.target.closest('[data-debug]')) {
        const body = overlay.querySelector('[data-debug-body]'), show = body.style.display === 'none';
        body.style.display = show ? 'block' : 'none'; body.textContent = debugReport();
        try { localStorage.setItem(DEBUG_KEY, show ? '1' : '0'); } catch (e) {}
      }
    });
  }

  // ---------- Retirement-triggered push ----------
  function completionState() {
    return {
      completed: Number(localStorage.getItem(CAREERS_COMPLETED_KEY) || '0'),
      football: (readJson(PER_SPORT_KEYS.football.careers, []) || []).length,
      basketball: (readJson(PER_SPORT_KEYS.basketball.careers, []) || []).length,
      active: !!activeSaveRecord(),
    };
  }
  function retirementText(text) { return /פרישה|לפרוש|פרוש|סיום קריירה/.test(norm(text)); }
  function retirementCompleted(before) {
    const after = completionState();
    return after.completed > before.completed || after.football > before.football || after.basketball > before.basketball || (before.active && !after.active);
  }
  function watchRetirementClick(event) {
    const control = event.target instanceof Element ? event.target.closest('button,[role="button"]') : null;
    if (!control || !retirementText(control.textContent)) return;
    const before = completionState();
    const check = async () => {
      if (!retirementCompleted(before) || !getStoredToken()) return false;
      try { await pushOwnSnapshot('retirement'); } catch (e) { console.warn('Legionnaire Insights: retirement sync failed', e); }
      return true;
    };
    setTimeout(async () => { if (!(await check())) setTimeout(check, 2600); }, 1200);
  }

  // ---------- Sparse startup/resume pull ----------
  async function startupPull() {
    if (!getStoredToken() || sessionStorage.getItem('legionnaire-insights:v8:startup-pulled') === '1') return;
    sessionStorage.setItem('legionnaire-insights:v8:startup-pulled', '1');
    try {
      const result = await pullAndMerge();
      if (result.changed && sessionStorage.getItem('legionnaire-insights:v8:reloaded') !== '1') { sessionStorage.setItem('legionnaire-insights:v8:reloaded', '1'); location.reload(); }
    } catch (e) { console.warn('Legionnaire Insights: startup pull failed', e); }
  }
  async function resumePullIfDue() {
    if (!getStoredToken()) return;
    const last = Number(GM_getValue(LAST_PULL_GM_KEY, 0)) || 0;
    if (Date.now() - last < 30 * 60 * 1000) return;
    try { const result = await pullAndMerge(); if (result.changed) location.reload(); }
    catch (e) { console.warn('Legionnaire Insights: resume pull failed', e); }
  }

  // ---------- Boot ----------
  function afterGameInteraction(event) {
    if (event.target instanceof Element && event.target.closest(`[${UI_ATTR}]`)) return;
    scheduleUiBurst();
  }

  ensureStyles();
  loadCachedClubs();
  syncHud();
  decorateClubs();
  decoratePredictions();
  maybeAutoContinue();

  document.addEventListener('click', watchRetirementClick, true);
  document.addEventListener('pointerup', afterGameInteraction, { passive: true });
  document.addEventListener('keyup', afterGameInteraction, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    syncHud(); decorateClubs(); decoratePredictions(); resumePullIfDue();
  });
  window.addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      syncHud();
      decoratePredictions();
      const hud = document.getElementById(HUD_ID);
      if (hud && hud.dataset.layout !== 'desktop') {
        const r = hud.getBoundingClientRect(), p = clamp(hud, r.left, r.top);
        hud.style.left = `${p.left}px`; hud.style.top = `${p.top}px`;
      }
    });
  });

  for (const delay of [100, 300, 700, 1400, 2400]) setTimeout(() => { syncHud(); decorateClubs(); decoratePredictions(); }, delay);
  const loadClubs = () => ensureClubDb().then(() => { decorateClubs(); scheduleUiBurst(); }).catch(() => {});
  if (typeof requestIdleCallback === 'function') requestIdleCallback(loadClubs, { timeout: 2200 }); else setTimeout(loadClubs, 900);
  const pull = () => startupPull();
  if (typeof requestIdleCallback === 'function') requestIdleCallback(pull, { timeout: 4500 }); else setTimeout(pull, 2200);
  checkUpdate(false).catch(() => {});
})();
