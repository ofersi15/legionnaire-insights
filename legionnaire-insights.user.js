// ==UserScript==
// @name         Legionnaire Insights
// @namespace    legionnaire-insights
// @version      7.2.0
// @description  Shows hidden player potential, club strength, agents and odds; includes automatic conflict-safe cross-device sync and self-updating delivery.
// @match        https://www.legionnaire.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      raw.githubusercontent.com
// @homepageURL  https://github.com/ofersi15/legionnaire-insights
// @source       https://github.com/ofersi15/legionnaire-insights
// @updateURL    https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// @downloadURL  https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// ==/UserScript==

// Current architecture and release notes live in AGENTS.md, docs/PROJECT.md,
// and CHANGELOG.md. Keep source comments limited to invariants and non-obvious
// implementation constraints.

(function () {
  'use strict';

  // ---------- Userscript update awareness ----------

  const SCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js';
  const UPDATE_LAST_CHECK_GM_KEY = 'legionnaire-insights:update-last-check';
  const UPDATE_LATEST_GM_KEY = 'legionnaire-insights:update-latest-version';
  const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  let updateCheckInFlight = null;
  let latestScriptVersion = GM_getValue(UPDATE_LATEST_GM_KEY, '');
  let updateCheckMessage = '';

  function currentScriptVersion() {
    return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '7.2.0';
  }

  function compareVersions(a, b) {
    const left = String(a).split('.').map((n) => Number(n) || 0);
    const right = String(b).split('.').map((n) => Number(n) || 0);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) - (right[i] || 0);
    }
    return 0;
  }

  function hasScriptUpdate() {
    return latestScriptVersion && compareVersions(latestScriptVersion, currentScriptVersion()) > 0;
  }

  function renderUpdateStatus() {
    const status = document.getElementById('li-update-status');
    const install = document.getElementById('li-install-update');
    if (status) {
      status.textContent = hasScriptUpdate()
        ? `Update ${latestScriptVersion} is available`
        : (updateCheckMessage || `Installed version ${currentScriptVersion()}`);
      status.style.color = hasScriptUpdate() ? '#facc15' : '#9ca3af';
    }
    if (install) {
      install.style.display = hasScriptUpdate() ? 'block' : 'none';
      install.textContent = hasScriptUpdate() ? `Install ${latestScriptVersion}` : 'Install update';
    }
    buildChrome();
  }

  function checkForScriptUpdate(force = false) {
    if (updateCheckInFlight) return updateCheckInFlight;
    const lastCheck = Number(GM_getValue(UPDATE_LAST_CHECK_GM_KEY, 0)) || 0;
    if (!force && Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
      renderUpdateStatus();
      return Promise.resolve(hasScriptUpdate());
    }

    updateCheckMessage = 'Checking for updates…';
    renderUpdateStatus();
    updateCheckInFlight = new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${SCRIPT_UPDATE_URL}?check=${Date.now()}`,
        onload: (response) => {
          const match = response.status >= 200 && response.status < 300
            ? response.responseText.match(/^\/\/ @version\s+([^\s]+)$/m)
            : null;
          if (match) {
            latestScriptVersion = match[1];
            GM_setValue(UPDATE_LATEST_GM_KEY, latestScriptVersion);
            GM_setValue(UPDATE_LAST_CHECK_GM_KEY, Date.now());
            updateCheckMessage = hasScriptUpdate() ? '' : `Up to date · ${currentScriptVersion()}`;
          } else {
            updateCheckMessage = 'Could not verify the latest version';
          }
          resolve(hasScriptUpdate());
        },
        onerror: () => { updateCheckMessage = 'Update check failed'; resolve(false); },
        ontimeout: () => { updateCheckMessage = 'Update check timed out'; resolve(false); },
        timeout: 15000,
      });
    }).finally(() => {
      updateCheckInFlight = null;
      renderUpdateStatus();
    });
    return updateCheckInFlight;
  }

  // ---------- React fiber reading ----------

  function getFiber(node) {
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
    return key ? node[key] : null;
  }

  function findRootFiber() {
    let anyEl = document.getElementById('root') || document.body;
    let fiber = getFiber(anyEl);
    if (!fiber) {
      for (const el of document.querySelectorAll('*')) {
        fiber = getFiber(el);
        if (fiber) break;
      }
    }
    while (fiber && fiber.return) fiber = fiber.return;
    return fiber;
  }

  // Walk the whole fiber tree (child + sibling) and collect any props
  // object that looks like it carries player/decision data.
  // Iterative (not recursive) to avoid stack overflows on deep trees.
  function collectProps(root) {
    const results = [];
    const seen = new Set();
    const stack = [root];
    let guard = 0;
    while (stack.length && guard < 50000) {
      guard++;
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);

      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        if ('decision' in props || (props.player && 'potential' in props.player)) {
          results.push(props);
        }
      }

      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return results;
  }

  function scan() {
    const root = findRootFiber();
    if (!root) return [];
    return collectProps(root);
  }

  // ---------- Club database (name + strength), pulled live from the site's own JS bundle ----------
  // Cached once per page load. Fails silently and falls back to raw IDs if the
  // bundle's internal layout changes after a future deploy.

  let clubsById = null; // Map<id, {name, league, tier, ovr}>
  let clubsLoadPromise = null;
  let clubsNextAttemptAt = 0;

  // The bundle embeds several separate club datasets (local + foreign,
  // football + basketball) as `JSON.parse(\`...\`)` blocks, in two
  // different shapes:
  //   - local clubs: array of objects {id, name, league, tier, baseOverall, ...}
  //   - foreign clubs: array of tuples [id, name, shortName, country, league, tier, baseOverall, ...]
  // We scan every such block in the bundle and merge whichever ones look
  // like club data into one unified id -> info map.
  async function loadClubsDb() {
    if (clubsById) return clubsById;
    if (clubsLoadPromise) return clubsLoadPromise;
    if (Date.now() < clubsNextAttemptAt) return null;
    clubsLoadPromise = (async () => {
      try {
        const scriptTag = [...document.scripts].find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
        if (!scriptTag) {
          clubsNextAttemptAt = Date.now() + 1000;
          return null;
        }
        const res = await fetch(scriptTag.src);
        if (!res.ok) throw new Error(`club bundle request failed: ${res.status}`);
        const src = await res.text();

      const marker = 'JSON.parse(`';
      const map = new Map();
      let searchFrom = 0;

      while (true) {
        const markerIdx = src.indexOf(marker, searchFrom);
        if (markerIdx === -1) break;
        const contentStart = markerIdx + marker.length;
        const contentEnd = src.indexOf('`)', contentStart);
        if (contentEnd === -1) break;
        searchFrom = contentEnd + 2;

        try {
          const rawTemplate = src.slice(contentStart, contentEnd);
          const resolved = (0, eval)('`' + rawTemplate.replace(/`/g, '\\`') + '`');
          const parsed = JSON.parse(resolved);
          if (!Array.isArray(parsed) || parsed.length === 0) continue;

          for (const c of parsed) {
            if (Array.isArray(c)) {
              // tuple format: [id, name, shortName, country, league, tier, baseOverall, ...]
              const id = c[0], name = c[1], league = c[4], tier = c[5], baseOverall = c[6];
              if (typeof id === 'string') map.set(id, { name, league, tier, ovr: baseOverall });
            } else if (c && typeof c === 'object' && typeof c.id === 'string') {
              map.set(c.id, { name: c.name, league: c.league, tier: c.tier, ovr: c.baseOverall });
            }
          }
        } catch (e) {
          // this block wasn't club data (or the format changed) - skip it
        }
      }

        if (map.size > 0) clubsById = map;
        return clubsById;
      } catch (e) {
        clubsById = null; // fail quietly
        clubsNextAttemptAt = Date.now() + 10000;
        return null;
      } finally {
        clubsLoadPromise = null;
      }
    })();
    const result = await clubsLoadPromise;
    if (result) render();
    return result;
  }

  function describeClub(clubId) {
    if (!clubId) return null;
    if (!clubsById) return 'טוען שם קבוצה…';
    const c = clubsById.get(clubId);
    if (!c) return 'קבוצה לא מזוהה';
    return `${c.name} (T${c.tier}, OVR ${c.ovr})`;
  }

  // ---------- Static agent reference table (from the game's own data, doesn't change per-save) ----------

  const AGENTS = [
    { name: 'רפי בן־עמי (מקומי)', cond: 'תמיד זמין', bonus: '+30% הצעות / +5% שווי', clubIds: ['il-1061', 'il-2173', 'il-2182'] },
    { name: 'מוטי אשכנזי (מחובר)', cond: 'overall > 66', bonus: '+40% הצעות / +~5% שווי בכל קבוצה בליגת העל' },
    { name: 'עדן רויטפרב (MLS)', cond: 'age > 18 וגם overall > 72', bonus: '+40% הצעות / +~4% שווי בקבוצות MLS/US' },
    { name: 'יורם שגיב (בינלאומי)', cond: 'age > 19 וגם overall > 76', bonus: '+50% הצעות / +4.5% שווי בקבוצות בלגיה' },
    { name: 'אבנר לביא (סוכן־על)', cond: 'overall > 84 או תואר אירופי', bonus: '+80% הצעות / +10% שווי בקבוצות עלית' },
    { name: 'מעגל האגדה', cond: 'הופך לאגדת מועדון', bonus: 'לא ממריא - שומר אותך בבית' },
  ];

  // ---------- Seed math: exact replica of the game's character-creation RNG ----------
  // Validated against a real save (matched developmentProfile + potential exactly).
  // Football's own "start career" flow always generates a fresh random seed and
  // ignores any ?seed= URL param (only the basketball flow reads that param) -
  // so applying a chosen seed to a football career has to go through localStorage
  // + a full reload, which the tools below automate.

  function sh(str) {
    let r = 2166136261 >>> 0;
    for (let n = 0; n < str.length; n++) {
      r ^= str.charCodeAt(n);
      r = Math.imul(r, 16777619);
    }
    return r >>> 0;
  }
  function Ks(seed) { return { seed, state: sh(seed) || 1 }; }
  function rh(state) {
    let r = (state + 1831565813) >>> 0;
    let n = r;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return { state: r, value: ((n ^ (n >>> 14)) >>> 0) / 4294967296 };
  }
  function Zl(rngObj) {
    const { state, value } = rh(rngObj.state);
    return { rng: { seed: rngObj.seed, state }, value };
  }
  function Xt(rngObj, lo, hi) {
    const a = Zl(rngObj);
    return { rng: a.rng, value: lo + a.value * (hi - lo) };
  }
  function Ql(rngObj, lo, hi) {
    if (hi < lo) return { rng: rngObj, value: lo };
    const a = Zl(rngObj);
    return { rng: a.rng, value: lo + Math.floor(a.value * (hi - lo + 1)) };
  }
  function Ve(rngObj, p) {
    const a = Zl(rngObj);
    return { rng: a.rng, value: a.value < p };
  }
  function Mh(rngObj) {
    const r = Zl(rngObj);
    const v = r.value < 0.1 ? 'early' : r.value < 0.2 ? 'late' : 'normal';
    return { rng: r.rng, value: v };
  }
  function Sh(rngObj, startingOverall) {
    const n = Xt(rngObj, 0, 1);
    const a = n.value;
    let c;
    if (a < 0.12) c = 62 + (a / 0.12) * 13;
    else if (a < 0.85) c = 75 + ((a - 0.12) / 0.73) * 9;
    else c = 84 + ((a - 0.85) / 0.15) * 9;
    const u = Xt(n.rng, -1, 1);
    return { rng: u.rng, value: Math.max(startingOverall + 4, Math.min(96, Math.round(c + u.value))) };
  }
  function computeCreation(seed) {
    let r = Ks(seed);
    const n = Ve(r, 0.1); r = n.rng;
    const [a, c] = n.value ? [66, 76] : [46, 52];
    const u = Ql(r, a, c); r = u.rng;
    const p = Mh(r); r = p.rng;
    const f = Sh(r, u.value); r = f.rng;
    return { elite: n.value, startingOverall: u.value, developmentProfile: p.value, potential: f.value };
  }
  function randomSeedString() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const part = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return part(8) + '-' + part(8);
  }

  // ---------- Apply a chosen seed to the ACTIVE sport's save + reload + auto-continue ----------
  // Bug fixed in 6.5: this used to write unconditionally to the football save key,
  // so on basketball it silently patched a save the game never reads - basketball
  // kept using its own (random) seed and Apply appeared to do nothing / "load a
  // different random seed". Fix: read maslul-kariera:sport:v1 to find which save
  // is actually active and write the seed there (basketball's shape also carries
  // a `height` field, preserved from the existing save if present).

  const SPORT_KEY = 'maslul-kariera:sport:v1';
  const AUTO_CONTINUE_KEY = 'legionnaire-insights:autoContinue';

  function getCurrentSport() {
    try {
      return localStorage.getItem(SPORT_KEY) === 'basketball' ? 'basketball' : 'football';
    } catch (e) {
      return 'football';
    }
  }

  function getSaveKeyForSport(sport) {
    return sport === 'basketball' ? 'maslul-kariera:basketball:save:v2' : 'maslul-kariera:football:save:v2';
  }

  function applySeedAndReload(seed) {
    const sport = getCurrentSport();
    const saveKey = getSaveKeyForSport(sport);
    let template = { lastName: 'Player', number: 10, foot: 'right', position: 'ST', cadence: 'intense' };
    if (sport === 'basketball') template.height = 190;
    try {
      const existingRaw = localStorage.getItem(saveKey);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
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

    const newSave = { ...template, seed, choices: [] };
    try {
      localStorage.setItem(saveKey, JSON.stringify(newSave));
      localStorage.setItem(AUTO_CONTINUE_KEY, '1');
    } catch (e) {}
    location.reload();
  }

  // On load, if we just applied a seed, auto-click "המשך קריירה קיימת" once the
  // home screen has rendered - so the whole flow is a single click, no manual
  // navigation after the reload.
  function maybeAutoContinue() {
    let flag;
    try { flag = localStorage.getItem(AUTO_CONTINUE_KEY); } catch (e) { return; }
    if (!flag) return;
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const btn = [...document.querySelectorAll('button, div, span')].find(
        (el) => el.children.length === 0 && el.textContent.trim() === 'המשך קריירה קיימת'
      );
      if (btn) {
        clearInterval(poll);
        try { localStorage.removeItem(AUTO_CONTINUE_KEY); } catch (e) {}
        btn.click();
      } else if (attempts > 40) {
        clearInterval(poll);
        try { localStorage.removeItem(AUTO_CONTINUE_KEY); } catch (e) {}
      }
    }, 250);
  }

  // ---------- Cross-device sync (export/import, CRDT-style idempotent merge) ----------
  // The game has no cloud sync and saves live only in each browser's localStorage.
  // Cumulative counters (careers-completed, trophy collections) are tracked as a
  // per-device ledger: each device's own contribution is stored separately and
  // merged via max() across devices, with the displayed total recomputed as the
  // sum. This is what makes repeated back-and-forth syncing (A->B->A, or several
  // devices through a shared cloud store) never inflate numbers - a naive "add
  // what changed since last sync" approach double-counts a device's own past
  // contribution once it's reflected back through another device (this was caught
  // in testing before shipping). Career-history arrays union by seed; one-off
  // saves/flags fill in only if missing, never silently overwriting a differing
  // value (e.g. an in-progress career).
  //
  // NOTE: export always scans every maslul-kariera:* key present in localStorage
  // (see syncExportPayload below) - it is NOT filtered to the sport that happens
  // to be active on this device. Both football and basketball data are always
  // included in both directions, on every sync, regardless of which sport you're
  // currently playing on the device doing the syncing.

  const SYNC_EXCLUDE = new Set(['maslul-kariera:sport:v1', 'maslul-kariera:currency:v1']);
  const SUM_NUMBER_KEYS = new Set(['maslul-kariera:careers-completed:v1']);
  const SUM_MAP_KEYS = new Set(['maslul-kariera:collection:v1', 'maslul-kariera:basketball:collection:v2']);
  const UNION_ARRAY_KEYS = new Set(['maslul-kariera:football:careers:v1', 'maslul-kariera:basketball:careers:v1']);
  const ACTIVE_SAVE_KEYS = new Set([
    'maslul-kariera:football:save:v2',
    'maslul-kariera:basketball:save:v2',
    'maslul-kariera:save:v1',
  ]);

  // Per-sport key map, used only for building the human-readable sync report
  // below (the actual sync/merge logic above is sport-agnostic by design).
  const PER_SPORT_KEYS = {
    football: {
      careers: 'maslul-kariera:football:careers:v1',
      save: 'maslul-kariera:football:save:v2',
      collection: 'maslul-kariera:collection:v1', // legacy unprefixed name = football's
    },
    basketball: {
      careers: 'maslul-kariera:basketball:careers:v1',
      save: 'maslul-kariera:basketball:save:v2',
      collection: 'maslul-kariera:basketball:collection:v2',
    },
  };
  const CAREERS_COMPLETED_KEY = 'maslul-kariera:careers-completed:v1';
  const SPORT_LABEL = { football: 'Football', basketball: 'Basketball' };

  const LEDGER_META_KEY = 'maslul-kariera-sync:ledger:v3';
  const DEVICE_ID_KEY = 'maslul-kariera-sync:device-id';
  const OLD_BASELINE_KEY = 'maslul-kariera-sync:baseline:v1'; // superseded format, never synced

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
  function getLedgerMeta() {
    try {
      const raw = localStorage.getItem(LEDGER_META_KEY);
      return raw ? JSON.parse(raw) : { numbers: {}, maps: {} };
    } catch (e) {
      return { numbers: {}, maps: {} };
    }
  }
  function saveLedgerMeta(meta) { localStorage.setItem(LEDGER_META_KEY, JSON.stringify(meta)); }

  // Merges one cumulative number key. remoteLedger (optional) is the other
  // side's {deviceId: count} breakdown for this key. Returns the ledger to publish.
  function mergeNumberKey(key, remoteLedger) {
    const myId = getDeviceId();
    const meta = getLedgerMeta();
    const entry = meta.numbers[key] || { ledger: {}, lastWritten: 0 };
    const currentGameValue = Number(localStorage.getItem(key) || '0');
    const organicDelta = currentGameValue - entry.lastWritten;
    entry.ledger[myId] = (entry.ledger[myId] || 0) + Math.max(0, organicDelta);
    if (remoteLedger) {
      for (const [devId, val] of Object.entries(remoteLedger)) {
        if (devId === myId) continue;
        entry.ledger[devId] = Math.max(entry.ledger[devId] || 0, Number(val) || 0);
      }
    }
    const newTotal = Object.values(entry.ledger).reduce((a, b) => a + b, 0);
    localStorage.setItem(key, String(newTotal));
    entry.lastWritten = newTotal;
    meta.numbers[key] = entry;
    saveLedgerMeta(meta);
    return entry.ledger;
  }

  function flattenNums(obj, prefix, out) {
    for (const k of Object.keys(obj || {})) {
      const path = prefix ? prefix + '.' + k : k;
      const v = obj[k];
      if (typeof v === 'number') out[path] = v;
      else if (v && typeof v === 'object') flattenNums(v, path, out);
    }
    return out;
  }
  function unflattenNums(flat) {
    const out = {};
    for (const [path, v] of Object.entries(flat)) {
      const parts = path.split('.');
      let node = out;
      for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
      node[parts[parts.length - 1]] = v;
    }
    return out;
  }

  // Same idea for a nested {category: {leaf: number}} map (trophy counts etc),
  // tracked per leaf. remoteLedger (optional) is {leafPath: {deviceId: count}}.
  function mergeMapKey(key, remoteLedger) {
    const myId = getDeviceId();
    const meta = getLedgerMeta();
    const entry = meta.maps[key] || { ledger: {}, lastWritten: {} };
    let currentGameValue = {};
    try { currentGameValue = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    const currentFlat = flattenNums(currentGameValue, '', {});
    const remoteFlat = remoteLedger || {};

    for (const leaf of Object.keys(currentFlat)) {
      const leafEntry = entry.ledger[leaf] || {};
      const lastWrittenLeaf = entry.lastWritten[leaf] || 0;
      const organicDelta = currentFlat[leaf] - lastWrittenLeaf;
      leafEntry[myId] = (leafEntry[myId] || 0) + Math.max(0, organicDelta);
      entry.ledger[leaf] = leafEntry;
    }
    for (const [leaf, devMap] of Object.entries(remoteFlat)) {
      const leafEntry = entry.ledger[leaf] || {};
      for (const [devId, val] of Object.entries(devMap)) {
        if (devId === myId) continue;
        leafEntry[devId] = Math.max(leafEntry[devId] || 0, Number(val) || 0);
      }
      entry.ledger[leaf] = leafEntry;
    }

    const newFlatTotal = {};
    for (const [leaf, devMap] of Object.entries(entry.ledger)) {
      newFlatTotal[leaf] = Object.values(devMap).reduce((a, b) => a + b, 0);
    }
    localStorage.setItem(key, JSON.stringify(unflattenNums(newFlatTotal)));
    entry.lastWritten = newFlatTotal;
    meta.maps[key] = entry;
    saveLedgerMeta(meta);
    return entry.ledger;
  }

  function syncUnionBySeed(a, b) {
    const map = new Map();
    for (const item of a || []) map.set(item.seed ?? JSON.stringify(item), item);
    for (const item of b || []) {
      const k = item.seed ?? JSON.stringify(item);
      if (!map.has(k)) map.set(k, item);
    }
    return [...map.values()];
  }

  // Active careers are event-sourced. If both devices have the same seed,
  // the save with the longer choices list is strictly further along and is
  // safe to select. Different seeds are a real conflict, so keep the local
  // career instead of silently destroying either device's in-progress run.
  function chooseActiveSave(targetRaw, sourceRaw) {
    if (!targetRaw) return sourceRaw;
    if (!sourceRaw || targetRaw === sourceRaw) return targetRaw;
    try {
      const target = JSON.parse(targetRaw);
      const source = JSON.parse(sourceRaw);
      if (target && source && target.seed === source.seed) {
        const targetSteps = Array.isArray(target.choices) ? target.choices.length : 0;
        const sourceSteps = Array.isArray(source.choices) ? source.choices.length : 0;
        return sourceSteps > targetSteps ? sourceRaw : targetRaw;
      }
    } catch (e) {}
    return targetRaw;
  }

  // ---------- Sync reporting helpers ----------
  // Take a snapshot of the counts that matter to the user (careers + trophies
  // per sport, total completed careers) so before/after can be shown, instead
  // of the old one-line-per-localStorage-key report.

  function safeParseArr(raw) {
    try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function safeParseObj(raw) {
    try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }
  function countMapLeaves(obj) {
    return Object.values(flattenNums(obj, '', {})).reduce((a, b) => a + b, 0);
  }

  function takeLocalSnapshot() {
    const snap = {};
    for (const sport of Object.keys(PER_SPORT_KEYS)) {
      const k = PER_SPORT_KEYS[sport];
      snap[sport] = {
        careersCount: safeParseArr(localStorage.getItem(k.careers)).length,
        trophiesCount: countMapLeaves(safeParseObj(localStorage.getItem(k.collection))),
        hasActiveSave: !!localStorage.getItem(k.save),
      };
    }
    snap.careersCompleted = Number(localStorage.getItem(CAREERS_COMPLETED_KEY) || '0');
    return snap;
  }

  // Sums a {leafPath: {deviceId: count}} per-leaf ledger (the shape used for
  // SUM_MAP_KEYS, e.g. trophy collections) down to one total.
  function sumMapLedger(mapLedger) {
    let total = 0;
    for (const devMap of Object.values(mapLedger || {})) {
      total += Object.values(devMap).reduce((a, b) => a + (Number(b) || 0), 0);
    }
    return total;
  }

  // Snapshot of what the OTHER side (a parsed __legSync:2 payload) held,
  // before it gets merged into this device.
  //
  // Bug fixed in 6.7: this originally read trophiesCount from
  // payload.data[collectionKey] - but SUM_MAP_KEYS (trophy collections) are
  // deliberately EXCLUDED from payload.data (see syncExportPayload's `skip`
  // set) and only ever travel inside payload.ledgers.maps. So this always
  // read undefined -> 0, which is why every sync report showed "(cloud had
  // 0)" for trophies regardless of the real number. Fixed by summing the
  // per-leaf ledger instead, matching how careersCompleted already worked.
  function takeRemoteSnapshotFromPayload(payload) {
    const snap = {};
    const data = (payload && payload.data) || {};
    const mapLedgers = (payload && payload.ledgers && payload.ledgers.maps) || {};
    for (const sport of Object.keys(PER_SPORT_KEYS)) {
      const k = PER_SPORT_KEYS[sport];
      snap[sport] = {
        careersCount: safeParseArr(data[k.careers]).length,
        trophiesCount: sumMapLedger(mapLedgers[k.collection]),
        hasActiveSave: !!data[k.save],
      };
    }
    const numberLedger = (payload && payload.ledgers && payload.ledgers.numbers && payload.ledgers.numbers[CAREERS_COMPLETED_KEY]) || {};
    snap.careersCompleted = Object.values(numberLedger).reduce((a, b) => a + (Number(b) || 0), 0);
    return snap;
  }

  function formatDelta(before, after) {
    const d = after - before;
    if (d === 0) return `${after} <span style="opacity:.5">(no change)</span>`;
    return `${before} &rarr; <b>${after}</b> <span style="color:#4ade80">(${d > 0 ? '+' : ''}${d})</span>`;
  }

  // preLocal/postLocal: takeLocalSnapshot() before and after the merge.
  // remoteBefore: takeRemoteSnapshotFromPayload() of whatever the cloud/other
  // device held before this merge (null for a fresh gist / no remote data).
  // verified: true/false/null - whether we confirmed the cloud now matches
  // exactly what we pushed (null = not applicable, e.g. manual export/import).
  function buildSyncReport({ preLocal, remoteBefore, postLocal, verified }) {
    const lines = [];
    for (const sport of Object.keys(PER_SPORT_KEYS)) {
      const pre = preLocal[sport], post = postLocal[sport], rem = remoteBefore ? remoteBefore[sport] : null;
      lines.push(`<b>${SPORT_LABEL[sport]}</b>`);
      lines.push(`&nbsp;&nbsp;Careers: ${formatDelta(pre.careersCount, post.careersCount)}${rem ? ` <span style="opacity:.5">(cloud had ${rem.careersCount})</span>` : ''}`);
      lines.push(`&nbsp;&nbsp;Trophies: ${formatDelta(pre.trophiesCount, post.trophiesCount)}${rem ? ` <span style="opacity:.5">(cloud had ${rem.trophiesCount})</span>` : ''}`);
    }
    lines.push(`<b>Total completed careers</b>: ${formatDelta(preLocal.careersCompleted, postLocal.careersCompleted)}`);
    if (typeof verified === 'boolean') {
      lines.push('');
      lines.push(
        verified
          ? '<span style="color:#4ade80">&#10003; Verified: cloud now matches this device exactly.</span>'
          : '<span style="color:#facc15">&#9888; Could not confirm a byte-exact match on this large payload (a known mobile-browser quirk, not a sign of lost data - every count above is correct). Safe to ignore; re-run Sync later if you want to double-check.</span>'
      );
    }
    return lines;
  }

  // ---------- In-page result modal ----------
  // Deliberately NOT using alert()/confirm() here. Those are shown after a
  // multi-step async chain (network round trips to GitHub), and on some
  // mobile browsers a native dialog fired well after the triggering click
  // can be silently blocked or auto-dismissed once "user activation" has
  // expired - which meant the "Reload now?" confirm() could vanish without
  // the user ever seeing it, so the page (and any screen already open, like
  // the careers list) never actually refreshed even though the merge itself
  // had succeeded. A real DOM modal with a real button avoids that failure
  // mode entirely.

  function closeSyncModal() {
    const m = document.getElementById('legionnaire-insights-modal');
    if (m) m.remove();
  }

  function showSyncModal(title, lines, opts = {}) {
    closeSyncModal();
    const overlay = document.createElement('div');
    overlay.id = 'legionnaire-insights-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 1000000;
      background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
      background: #0e0e12; color: #e5e7eb; border: 1px solid #444; border-radius: 10px;
      padding: 16px; width: min(320px, 90vw); max-height: 80vh; overflow: auto;
      font: 12px monospace; line-height: 1.7; direction: ltr; text-align: left;
    `;
    box.innerHTML = `<b style="color:#4ade80; font-size:13px;">${title}</b><div style="margin-top:8px;">${lines.join('<br>')}</div>`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px; margin-top:14px;';

    if (opts.showReload) {
      const reloadBtn = document.createElement('button');
      reloadBtn.textContent = 'Reload now';
      reloadBtn.style.cssText = 'flex:1; background:#4ade80; color:#05230f; border:none; border-radius:6px; padding:8px; font:12px monospace; font-weight:bold; cursor:pointer;';
      reloadBtn.addEventListener('click', () => location.reload());
      btnRow.appendChild(reloadBtn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.textContent = opts.showReload ? 'Later' : 'Close';
    closeBtn.style.cssText = 'flex:1; background:#222; color:#e5e7eb; border:1px solid #444; border-radius:6px; padding:8px; font:12px monospace; cursor:pointer;';
    closeBtn.addEventListener('click', closeSyncModal);
    btnRow.appendChild(closeBtn);

    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function syncExportPayload() {
    const ledgers = { numbers: {}, maps: {} };
    for (const key of SUM_NUMBER_KEYS) {
      if (localStorage.getItem(key) == null) continue;
      ledgers.numbers[key] = mergeNumberKey(key, undefined);
    }
    for (const key of SUM_MAP_KEYS) {
      if (localStorage.getItem(key) == null) continue;
      ledgers.maps[key] = mergeMapKey(key, undefined);
    }
    const skip = new Set([...SUM_NUMBER_KEYS, ...SUM_MAP_KEYS, ...SYNC_EXCLUDE, LEDGER_META_KEY, DEVICE_ID_KEY, OLD_BASELINE_KEY]);
    const otherKeys = Object.keys(localStorage).filter((k) => k.startsWith('maslul-kariera') && !skip.has(k));
    const data = {};
    for (const k of otherKeys) data[k] = localStorage.getItem(k);
    return { __legSync: 2, ts: Date.now(), ledgers, data };
  }

  function syncImportPayload(payload) {
    if (!payload || payload.__legSync !== 2) {
      throw new Error('Not a valid (or outdated) sync payload - re-export from the other device with the current script version.');
    }
    const report = [];
    for (const [key, remoteLedger] of Object.entries(payload.ledgers.numbers || {})) {
      mergeNumberKey(key, remoteLedger);
      report.push(`${key.split(':').pop()}: ${localStorage.getItem(key)}`);
    }
    for (const [key, remoteLedger] of Object.entries(payload.ledgers.maps || {})) {
      mergeMapKey(key, remoteLedger);
      report.push(`${key.split(':').pop()}: merged`);
    }
    for (const [key, sourceRaw] of Object.entries(payload.data || {})) {
      const targetRaw = localStorage.getItem(key);
      if (UNION_ARRAY_KEYS.has(key)) {
        const t = targetRaw ? JSON.parse(targetRaw) : [];
        const s = sourceRaw ? JSON.parse(sourceRaw) : [];
        const merged = syncUnionBySeed(t, s);
        localStorage.setItem(key, JSON.stringify(merged));
        report.push(`${key.split(':').pop()}: ${t.length} -> ${merged.length}`);
      } else if (ACTIVE_SAVE_KEYS.has(key)) {
        const selected = chooseActiveSave(targetRaw, sourceRaw);
        if (selected !== targetRaw) {
          localStorage.setItem(key, selected);
          report.push(`${key.split(':').pop()}: advanced to the newer checkpoint`);
        } else {
          report.push(`${key.split(':').pop()}: kept local career`);
        }
      } else {
        if (targetRaw) {
          report.push(targetRaw === sourceRaw ? `${key.split(':').pop()}: identical` : `${key.split(':').pop()}: KEPT existing (differs)`);
          continue;
        }
        localStorage.setItem(key, sourceRaw);
        report.push(`${key.split(':').pop()}: added`);
      }
    }
    return report;
  }

  // Retries after focusing (a click inside our own panel should normally keep
  // focus, but this mirrors the bookmarklet fallback in case a permission
  // prompt or other transient state gets in the way), then falls back to
  // execCommand, then a manual-copy prompt as a last resort.
  async function robustCopy(text) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        window.focus();
        await navigator.clipboard.writeText(text);
        return 'clipboard';
      } catch (e) {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
      }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return 'execCommand';
    } catch (e) {}
    prompt('Copy failed automatically. Select all and copy this manually:', text);
    return 'manual';
  }

  function isValidSyncText(t) {
    if (!t) return false;
    try {
      const p = JSON.parse(t);
      return !!(p && p.__legSync === 2 && p.data);
    } catch (e) {
      return false;
    }
  }

  // Only trusts an auto-read clipboard value if it actually validates as sync
  // data - a stale clipboard (e.g. still holding a copied bookmarklet, or
  // anything else) falls straight through to asking for a manual paste,
  // rather than failing on it.
  async function robustPaste() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        window.focus();
        const text = await navigator.clipboard.readText();
        if (isValidSyncText(text)) return text;
      } catch (e) {}
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
    for (let i = 0; i < 3; i++) {
      const text = prompt('Paste the sync data here (copied via Export on the other device - e.g. from a WhatsApp/Telegram message to yourself, Notes, or email):');
      if (!text) return null;
      if (isValidSyncText(text)) return text;
      alert('That does not look like valid sync data (or the paste was incomplete). Please try again with the FULL exported text.');
    }
    return null;
  }

  async function doExport() {
    try {
      const payload = syncExportPayload();
      const text = JSON.stringify(payload);
      const how = await robustCopy(text);
      const snap = takeLocalSnapshot();
      const lines = [
        `${how === 'manual' ? 'Please copy the text shown.' : 'Copied to clipboard'} - ${(text.length / 1024).toFixed(1)}KB`,
        '',
        `<b>${SPORT_LABEL.football}</b>: ${snap.football.careersCount} careers, ${snap.football.trophiesCount} trophies`,
        `<b>${SPORT_LABEL.basketball}</b>: ${snap.basketball.careersCount} careers, ${snap.basketball.trophiesCount} trophies`,
        '',
        'Paste it into Import on the other device (via a message-to-yourself, Notes, or email if the clipboard doesn\'t carry across devices).',
      ];
      showSyncModal('Export ready', lines, {});
    } catch (e) {
      showSyncModal('Export failed', [String(e.message || e)], {});
    }
  }

  async function doImport() {
    try {
      const text = await robustPaste();
      if (!text) { showSyncModal('Import', ['No valid data provided.'], {}); return; }
      const payload = JSON.parse(text);
      const preLocal = takeLocalSnapshot();
      const remoteBefore = takeRemoteSnapshotFromPayload(payload);
      syncImportPayload(payload);
      const postLocal = takeLocalSnapshot();
      const lines = buildSyncReport({ preLocal, remoteBefore, postLocal, verified: null });
      showSyncModal('Manual import complete', lines, { showReload: true });
    } catch (e) {
      showSyncModal('Import failed', [String(e.message || e)], {});
    }
  }

  // ---------- Cloud sync (one tap, two-way) via a private GitHub Gist ----------
  // Setup is one-time: a GitHub personal access token (gist scope) + a Gist ID.
  // The FIRST device to sync creates the gist and shows its ID - copy that
  // short ID (not the whole export) over to the other device once. After
  // that, "Sync Now" on either device pulls whatever's in the gist, merges
  // it in with the same idempotent logic as manual import, then pushes the
  // combined result back up - so the gist always ends up holding the union.
  // As of 6.6 it also re-fetches the gist after pushing and byte-compares it
  // against what was sent, so the report can say for certain whether the
  // cloud copy now truly matches this device rather than just assuming the
  // PATCH request's 2xx response means the content landed correctly.

  const GH_TOKEN_KEY = 'legionnaire-insights:gh-token'; // legacy localStorage key; migrated below
  const GH_TOKEN_GM_KEY = 'github-token-v1';
  const GH_GIST_ID_KEY = 'legionnaire-insights:gh-gist-id';
  const GIST_FILENAME = 'legionnaire-sync.json'; // legacy single-file name, no longer written (see GIST_FILES)
  const DEFAULT_GIST_ID = 'e1226286d7087eb8faacbf820b8b666f'; // shared gist for this player's devices
  const GIST_OWNER = 'ofersi15'; // needed to build gist.githubusercontent.com raw URLs

  // As of 6.13, the sync payload is split across several smaller files in
  // the same gist instead of one big legionnaire-sync.json. Confirmed via a
  // real device: a single ~944KB PATCH body was silently truncated to
  // ~834KB somewhere between GM_xmlhttpRequest and GitHub (evidenced by
  // GitHub's own PATCH response echoing back fewer bytes than were sent) -
  // almost certainly a message-size limit in the browser/extension bridge
  // on that device, not anything GitHub-side. Splitting into several
  // sub-200KB-ish pieces, each pushed with its own PATCH call, keeps every
  // individual request comfortably under whatever that limit is. The CRDT
  // merge logic itself is unchanged - this only changes how the same
  // {__legSync, ts, ledgers, data} payload is transported.
  const GIST_FILES = {
    meta: 'legionnaire-sync-meta.json',
    numbers: 'legionnaire-sync-numbers.json',
    mapFootball: 'legionnaire-sync-map-football.json',
    mapBasketball: 'legionnaire-sync-map-basketball.json',
    careersFootball: 'legionnaire-sync-careers-football.json',
    careersBasketball: 'legionnaire-sync-careers-basketball.json',
    other: 'legionnaire-sync-other.json',
  };
  const FOOTBALL_MAP_KEY = 'maslul-kariera:collection:v1';
  const BASKETBALL_MAP_KEY = 'maslul-kariera:basketball:collection:v2';
  const FOOTBALL_CAREERS_KEY = 'maslul-kariera:football:careers:v1';
  const BASKETBALL_CAREERS_KEY = 'maslul-kariera:basketball:careers:v1';

  function ghRequest(method, url, token, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: {
          Authorization: 'token ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
        data: body ? JSON.stringify(body) : undefined,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try { resolve(JSON.parse(res.responseText)); } catch (e) { resolve(null); }
          } else if (res.status === 401) {
            const err = new Error('401');
            err.isAuthError = true;
            reject(err);
          } else {
            reject(new Error(`GitHub API ${res.status}: ${res.responseText.slice(0, 200)}`));
          }
        },
        onerror: () => reject(new Error('Network error contacting GitHub')),
      });
    });
  }

  // Plain-text fetch of one gist file's raw content, bypassing the JSON API
  // wrapper entirely - smaller individual responses than asking for the
  // whole gist object, and works without a token (secret gists are readable
  // by anyone with the exact raw URL, just not listed/searchable).
  function ghRawFetch(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else if (res.status === 404) resolve(null); // file doesn't exist yet
          else reject(new Error(`Raw fetch ${res.status} for ${url}`));
        },
        onerror: () => reject(new Error('Network error fetching raw gist file')),
      });
    });

  }

  // Appends a unique query param so repeated GETs to the same gist URL can't
  // be served from a browser/extension-layer HTTP cache instead of actually
  // hitting GitHub again. Kept for the initial pull GET even though cloud
  // sync's own write-verification no longer relies on a follow-up GET (see
  // the 6.12 changelog note) - still worth having on the pull itself.
  function bustCache(url) {
    return url + (url.includes('?') ? '&' : '?') + '_ts=' + Date.now() + Math.random().toString(36).slice(2);
  }

  function promptForToken(reason) {
    const msg =
      (reason ? reason + '\n\n' : '') +
      'Paste a GitHub personal access token with Gists access.\n' +
      'Create one at https://github.com/settings/personal-access-tokens/new\n' +
      'Under "Account permissions", set "Gists" to "Read and write".';
    const t = prompt(msg);
    if (!t) return null;
    const trimmed = t.trim();
    GM_setValue(GH_TOKEN_GM_KEY, trimmed);
    localStorage.removeItem(GH_TOKEN_KEY);
    return trimmed;
  }

  function getStoredToken() {
    let token = GM_getValue(GH_TOKEN_GM_KEY, '');
    if (!token) {
      // One-time migration from v6.x. Page JavaScript can read origin
      // localStorage, while it cannot read this userscript-private store.
      token = localStorage.getItem(GH_TOKEN_KEY) || '';
      if (token) {
        GM_setValue(GH_TOKEN_GM_KEY, token);
        localStorage.removeItem(GH_TOKEN_KEY);
      }
    }
    return token;
  }

  // Wraps ghRequest so a stored-but-now-invalid token (expired/revoked/wrong
  // scope) is cleared and re-prompted for automatically on a 401, instead of
  // just failing - the retry uses the freshly entered token immediately.
  async function ghRequestAuto(method, url, body) {
    let token = getStoredToken();
    if (!token) {
      token = promptForToken();
      if (!token) throw new Error('No token provided');
    }
    try {
      return await ghRequest(method, url, token, body);
    } catch (e) {
      if (e.isAuthError) {
        GM_deleteValue(GH_TOKEN_GM_KEY);
        localStorage.removeItem(GH_TOKEN_KEY);
        const retryToken = promptForToken('That token was rejected (401 Bad credentials) - it may be expired, revoked, or missing Gists access. Paste a new one:');
        if (!retryToken) throw new Error('No valid token provided');
        return await ghRequest(method, url, retryToken, body);
      }
      throw e;
    }
  }

  async function ensureGistId() {
    let gistId = localStorage.getItem(GH_GIST_ID_KEY);
    if (gistId !== DEFAULT_GIST_ID) {
      gistId = DEFAULT_GIST_ID;
      localStorage.setItem(GH_GIST_ID_KEY, gistId);
    }
    return gistId;
  }

  // Splits the unified {__legSync, ts, ledgers, data} payload (built by
  // syncExportPayload, unchanged) into the smaller per-file chunks pushed
  // to the gist. payload.data's values are already JSON-text strings (raw
  // localStorage.getItem results), so the two careers-array chunks are
  // written as-is - no re-stringify needed.
  function splitPayloadIntoChunks(payload) {
    const meta = JSON.stringify({ __legSync: payload.__legSync, ts: payload.ts });
    const numbers = JSON.stringify(payload.ledgers.numbers || {});
    const mapFootball = JSON.stringify((payload.ledgers.maps && payload.ledgers.maps[FOOTBALL_MAP_KEY]) || {});
    const mapBasketball = JSON.stringify((payload.ledgers.maps && payload.ledgers.maps[BASKETBALL_MAP_KEY]) || {});
    const careersFootball = payload.data[FOOTBALL_CAREERS_KEY] || '[]';
    const careersBasketball = payload.data[BASKETBALL_CAREERS_KEY] || '[]';
    const other = {};
    for (const [k, v] of Object.entries(payload.data)) {
      if (k === FOOTBALL_CAREERS_KEY || k === BASKETBALL_CAREERS_KEY) continue;
      other[k] = v;
    }
    return {
      [GIST_FILES.meta]: meta,
      [GIST_FILES.numbers]: numbers,
      [GIST_FILES.mapFootball]: mapFootball,
      [GIST_FILES.mapBasketball]: mapBasketball,
      [GIST_FILES.careersFootball]: careersFootball,
      [GIST_FILES.careersBasketball]: careersBasketball,
      [GIST_FILES.other]: JSON.stringify(other),
    };
  }

  // Inverse of splitPayloadIntoChunks: rebuilds the unified payload shape
  // from separately-fetched chunk contents so the existing merge functions
  // (syncImportPayload, takeRemoteSnapshotFromPayload) don't need to change
  // at all. Returns null if no meta chunk is present (nothing pushed yet).
  function buildUnifiedPayloadFromChunks(chunks) {
    if (!chunks[GIST_FILES.meta]) return null;
    let meta;
    try { meta = JSON.parse(chunks[GIST_FILES.meta]); } catch (e) { return null; }
    const numbers = safeParseObj(chunks[GIST_FILES.numbers]);
    const mapFootball = safeParseObj(chunks[GIST_FILES.mapFootball]);
    const mapBasketball = safeParseObj(chunks[GIST_FILES.mapBasketball]);
    const other = safeParseObj(chunks[GIST_FILES.other]);
    const data = { ...other };
    if (chunks[GIST_FILES.careersFootball] != null) data[FOOTBALL_CAREERS_KEY] = chunks[GIST_FILES.careersFootball];
    if (chunks[GIST_FILES.careersBasketball] != null) data[BASKETBALL_CAREERS_KEY] = chunks[GIST_FILES.careersBasketball];
    return {
      __legSync: meta.__legSync || 2,
      ts: meta.ts || Date.now(),
      ledgers: { numbers, maps: { [FOOTBALL_MAP_KEY]: mapFootball, [BASKETBALL_MAP_KEY]: mapBasketball } },
      data,
    };
  }

  // Pulls every chunk file individually via its raw URL (small, unwrapped
  // responses - see ghRawFetch). Missing files (first-ever sync) resolve to
  // null and are treated as empty by buildUnifiedPayloadFromChunks.
  async function pullSyncChunks(gistId) {
    const chunks = {};
    for (const filename of Object.values(GIST_FILES)) {
      const attempts = 3;
      let got = null;
      for (let i = 0; i < attempts; i++) {
        try {
          got = await ghRawFetch(bustCache(`https://gist.githubusercontent.com/${GIST_OWNER}/${gistId}/raw/${filename}`));
          break; // success (including a real 404 -> null, which is a valid "doesn't exist" answer)
        } catch (e) {
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
      }
      chunks[filename] = got;
    }
    return chunks;
  }

  // Pushes each chunk with its own PATCH call (sequential, not parallel -
  // keeps things simple and avoids hammering the API), verifying each one
  // against GitHub's own echoed-back content. Returns a per-file result map
  // so a failure can be pinpointed to a specific piece instead of an opaque
  // "something didn't match".
  // Pushes one chunk, with the raw-read fallback described above. Returns
  // {ok, sentBytes, gotBytes}.
  async function pushOneChunk(gistId, filename, content) {
    const patchResult = await ghRequestAuto('PATCH', `https://api.github.com/gists/${gistId}`, {
      files: { [filename]: { content } },
    });
    const patchedFile = patchResult && patchResult.files && patchResult.files[filename];
    const patchedContent = patchedFile && typeof patchedFile.content === 'string' ? patchedFile.content : null;
    let ok = !!(patchedContent && patchedContent.trim() === content.trim());
    let gotBytes = patchedContent ? patchedContent.length : 0;

    // Seen on a real device: a brand-new small file's content sometimes
    // isn't echoed back in the PATCH response right away (a 1.8KB file
    // failing this way rules out the earlier truncation cause - that only
    // ever showed up on much larger payloads). Before calling it a
    // failure, do one direct raw read of that specific file as a
    // fallback, short delay first in case it's a brief propagation lag.
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        const raw = await ghRawFetch(bustCache(`https://gist.githubusercontent.com/${GIST_OWNER}/${gistId}/raw/${filename}`));
        if (raw != null) {
          gotBytes = raw.length;
          if (raw.trim() === content.trim()) ok = true;
        }
      } catch (e) {
        // leave as failed if the fallback check itself errors
      }
    }
    return { ok, sentBytes: content.length, gotBytes };
  }

  // Retries a failed chunk push automatically (network blips on a mobile
  // connection are the most likely cause of a scattered, inconsistent
  // failure pattern across otherwise-unrelated small files - retrying
  // transparently here means the person doesn't have to notice a failure,
  // judge whether it's "real", and manually press Sync again themselves).
  async function pushOneChunkWithRetry(gistId, filename, content, attempts = 3) {
    let last;
    for (let i = 0; i < attempts; i++) {
      try {
        last = await pushOneChunk(gistId, filename, content);
        if (last.ok) return last;
      } catch (e) {
        last = { ok: false, sentBytes: content.length, gotBytes: 0, error: String(e.message || e) };
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
    return last;
  }

  async function pushSyncChunks(gistId, chunkContents) {
    const results = {};
    for (const [filename, content] of Object.entries(chunkContents)) {
      results[filename] = await pushOneChunkWithRetry(gistId, filename, content);
    }
    return results;
  }

  // ---------- Cloud sync v3: one compressed snapshot per device ----------
  // v6.x made every device overwrite the same seven files. Even with CRDT
  // merging, simultaneous writes could race and each sync needed many mobile
  // network round trips. v7 writes one gzip-compressed file per stable device
  // ID. Devices never overwrite each other, and a normal sync is one Gist GET
  // plus (only when local state changed) one PATCH.
  const DEVICE_FILE_PREFIX = 'legionnaire-device-';
  const DEVICE_FILE_SUFFIX = '.snapshot.json';
  const AUTO_SYNC_GM_KEY = 'auto-sync-enabled-v1';
  const LAST_SYNC_GM_KEY = 'last-sync-at-v1';
  let syncInFlight = null;
  let autoSyncTimer = null;
  let lastObservedGameFingerprint = '';
  let lastUserActivityAt = 0;

  function hash32(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  async function sha256Hex(text) {
    if (!(globalThis.crypto && crypto.subtle)) return hash32(text);
    const bytes = new TextEncoder().encode(text);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function encodeSnapshotText(text) {
    if (typeof CompressionStream !== 'function') {
      return { encoding: 'plain-base64', data: bytesToBase64(new TextEncoder().encode(text)) };
    }
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { encoding: 'gzip-base64', data: bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer())) };
  }

  async function decodeSnapshotText(wrapper) {
    const bytes = base64ToBytes(wrapper.data || '');
    if (wrapper.encoding === 'plain-base64') return new TextDecoder().decode(bytes);
    if (wrapper.encoding !== 'gzip-base64' || typeof DecompressionStream !== 'function') {
      throw new Error(`Unsupported snapshot encoding: ${wrapper.encoding || 'missing'}`);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  async function payloadStateHash(payload) {
    // ts is deliberately excluded: a periodic read with no game changes must
    // not create a new Gist revision or consume another mobile upload.
    return await sha256Hex(JSON.stringify({ ...payload, ts: 0 }));
  }

  async function packDeviceSnapshot(payload, deviceId) {
    const text = JSON.stringify(payload);
    const encoded = await encodeSnapshotText(text);
    return JSON.stringify({
      schema: 3,
      deviceId,
      updatedAt: Date.now(),
      stateHash: await payloadStateHash(payload),
      payloadHash: await sha256Hex(text),
      encoding: encoded.encoding,
      data: encoded.data,
    });
  }

  async function unpackDeviceSnapshot(content) {
    const wrapper = JSON.parse(content);
    if (!wrapper || wrapper.schema !== 3 || !wrapper.data) throw new Error('Invalid v3 snapshot');
    const text = await decodeSnapshotText(wrapper);
    if (wrapper.payloadHash && (await sha256Hex(text)) !== wrapper.payloadHash) throw new Error('Snapshot checksum mismatch');
    const payload = JSON.parse(text);
    if (!payload || payload.__legSync !== 2) throw new Error('Invalid sync payload in snapshot');
    return { wrapper, payload };
  }

  async function readGistFileText(file) {
    if (file && typeof file.content === 'string' && !file.truncated) return file.content;
    if (file && file.raw_url) return await ghRawFetch(bustCache(file.raw_url));
    return null;
  }

  async function readDeviceSnapshots(gist) {
    const out = [];
    for (const [filename, file] of Object.entries((gist && gist.files) || {})) {
      if (!filename.startsWith(DEVICE_FILE_PREFIX) || !filename.endsWith(DEVICE_FILE_SUFFIX)) continue;
      try {
        const content = await readGistFileText(file);
        if (!content) continue;
        const decoded = await unpackDeviceSnapshot(content);
        out.push({ filename, ...decoded });
      } catch (e) {
        console.warn(`Legionnaire Insights: ignored unreadable ${filename}`, e);
      }
    }
    return out;
  }

  async function pushDeviceSnapshot(gistId, filename, content, attempts = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const result = await ghRequestAuto('PATCH', `https://api.github.com/gists/${gistId}`, {
          files: { [filename]: { content } },
        });
        const file = result && result.files && result.files[filename];
        let echoed = file && typeof file.content === 'string' && !file.truncated ? file.content : null;
        if (echoed !== content && file && file.raw_url) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          echoed = await ghRawFetch(bustCache(file.raw_url));
        }
        if (echoed === content) return true;
        lastError = new Error(`GitHub returned ${echoed ? echoed.length : 0} of ${content.length} characters`);
      } catch (e) {
        lastError = e;
      }
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
    throw lastError || new Error('Could not verify device snapshot');
  }

  function gameStateFingerprint() {
    const rows = [];
    for (const key of Object.keys(localStorage).sort()) {
      if (!key.startsWith('maslul-kariera')) continue;
      if (SYNC_EXCLUDE.has(key)) continue;
      rows.push(key, '\u0000', localStorage.getItem(key) || '', '\u0001');
    }
    return hash32(rows.join(''));
  }

  function setSyncStatus(text, color = '#9ca3af') {
    const el = document.getElementById('li-sync-status');
    if (el) {
      el.textContent = text;
      el.style.color = color;
    }
  }

  function isAutoSyncEnabled() {
    return GM_getValue(AUTO_SYNC_GM_KEY, true) !== false;
  }

  function maybeReloadAfterRemoteChange(reason, before, after, activityAtStart) {
    if (before === after || !['startup', 'resume'].includes(reason)) return;
    if (lastUserActivityAt !== activityAtStart) {
      setSyncStatus('Synced; remote changes appear on next reload', '#facc15');
      return;
    }
    const marker = `li-v7-reloaded-${after}`;
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, '1');
    setSyncStatus('Remote progress received; reloading…', '#4ade80');
    setTimeout(() => location.reload(), 700);
  }

  async function runCloudSync(opts = {}) {
    const silent = !!opts.silent;
    const reason = opts.reason || 'manual';
    const activityAtStart = lastUserActivityAt;
    const gistId = await ensureGistId();
    const preLocal = takeLocalSnapshot();
    const beforeFingerprint = gameStateFingerprint();
    setSyncStatus('Syncing…', '#60a5fa');

    // One metadata request discovers every independent device snapshot.
    const gist = await ghRequestAuto('GET', `https://api.github.com/gists/${gistId}`);
    const snapshots = await readDeviceSnapshots(gist);
    let remoteBefore = null;
    if (snapshots.length) {
      for (const snapshot of snapshots) {
        remoteBefore = takeRemoteSnapshotFromPayload(snapshot.payload);
        syncImportPayload(snapshot.payload);
      }
    } else {
      // First v7 run: import the existing seven-file v6.15 cloud state once,
      // then publish it in the new per-device format.
      const legacyChunks = await pullSyncChunks(gistId);
      const legacyPayload = buildUnifiedPayloadFromChunks(legacyChunks);
      if (legacyPayload && legacyPayload.data) {
        remoteBefore = takeRemoteSnapshotFromPayload(legacyPayload);
        syncImportPayload(legacyPayload);
      }
    }

    const afterRemoteFingerprint = gameStateFingerprint();
    const postLocal = takeLocalSnapshot();
    const freshPayload = syncExportPayload();
    const deviceId = getDeviceId();
    const filename = `${DEVICE_FILE_PREFIX}${deviceId}${DEVICE_FILE_SUFFIX}`;
    const stateHash = await payloadStateHash(freshPayload);
    const own = snapshots.find((item) => item.filename === filename);
    let uploaded = false;
    let packedBytes = 0;

    if (!own || own.wrapper.stateHash !== stateHash) {
      const packed = await packDeviceSnapshot(freshPayload, deviceId);
      packedBytes = packed.length;
      await pushDeviceSnapshot(gistId, filename, packed);
      uploaded = true;
    }

    GM_setValue(LAST_SYNC_GM_KEY, Date.now());
    lastObservedGameFingerprint = gameStateFingerprint();
    setSyncStatus(uploaded ? `Synced · uploaded ${(packedBytes / 1024).toFixed(1)} KB` : 'Synced · no upload needed', '#4ade80');

    if (!silent) {
      const lines = buildSyncReport({ preLocal, remoteBefore, postLocal, verified: null });
      lines.push('');
      lines.push(uploaded
        ? `<span style="color:#4ade80">&#10003; Device snapshot verified (${(packedBytes / 1024).toFixed(1)}KB).</span>`
        : '<span style="color:#4ade80">&#10003; Already current; nothing uploaded.</span>');
      showSyncModal('&#9729; Cloud sync complete', lines, { showReload: beforeFingerprint !== afterRemoteFingerprint });
    } else {
      maybeReloadAfterRemoteChange(reason, beforeFingerprint, afterRemoteFingerprint, activityAtStart);
    }
    return { uploaded, remoteChanged: beforeFingerprint !== afterRemoteFingerprint };
  }

  function cloudSyncNow(opts = {}) {
    if (syncInFlight) return syncInFlight;
    syncInFlight = runCloudSync(opts)
      .catch((e) => {
        setSyncStatus(`Sync failed: ${String(e.message || e)}`, '#f87171');
        if (!opts.silent) showSyncModal('&#9729; Cloud sync failed', [String(e.message || e)], {});
        return { uploaded: false, remoteChanged: false, error: e };
      })
      .finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  function scheduleAutoSync(reason, delay = 1200) {
    if (!isAutoSyncEnabled() || !getStoredToken()) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      cloudSyncNow({ silent: true, reason }).catch(() => {});
    }, delay);
  }

  function initAutoSync() {
    lastObservedGameFingerprint = gameStateFingerprint();
    for (const eventName of ['pointerdown', 'keydown']) {
      window.addEventListener(eventName, () => { lastUserActivityAt = Date.now(); }, { passive: true });
    }

    // Detect game writes without patching Storage.prototype (which is not
    // dependable across Tampermonkey's isolated page/userscript worlds).
    setInterval(() => {
      const now = gameStateFingerprint();
      if (now !== lastObservedGameFingerprint) {
        lastObservedGameFingerprint = now;
        scheduleAutoSync('local-change', 5000); // debounce bursts of choices
      }
    }, 3000);

    // Startup/resume pulls keep the second device fresh; periodic checks are
    // cheap because unchanged state performs only the single Gist GET.
    setTimeout(() => scheduleAutoSync('startup', 0), 1800);
    setInterval(() => {
      if (document.visibilityState === 'visible') scheduleAutoSync('periodic', 0);
    }, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleAutoSync('resume', 300);
      else scheduleAutoSync('background', 0);
    });
  }

  function resetCloudSettings() {
    if (!confirm('Forget the saved GitHub token and Gist ID on this device?')) return;
    GM_deleteValue(GH_TOKEN_GM_KEY);
    localStorage.removeItem(GH_TOKEN_KEY);
    localStorage.removeItem(GH_GIST_ID_KEY);
    alert('Cleared. Next "Sync Now" will ask for setup again.');
  }

  const MODE_KEY = 'legionnaire-insights:mode';
  const TAB_KEY = 'legionnaire-insights:tab';
  function getMode() {
    try {
      return localStorage.getItem(MODE_KEY) || (matchMedia('(max-width: 640px)').matches ? 'compact' : 'full');
    } catch (e) {
      return 'full';
    }
  }
  function getTab() {
    try { return localStorage.getItem(TAB_KEY) || 'now'; } catch (e) { return 'now'; }
  }
  function setTab(tab) {
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
    buildChrome();
  }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
    buildChrome(); // rebuild header/visibility immediately on toggle
    render();
  }

  // ---------- DOM scaffolding (built once; content div is what render() updates) ----------

  function ensurePanel() {
    let panel = document.getElementById('legionnaire-insights-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'legionnaire-insights-panel';
    panel.className = 'li-panel';

    const style = document.createElement('style');
    style.textContent = `
      .li-panel { position:fixed; top:12px; left:12px; z-index:999999; box-sizing:border-box;
        width:min(340px, calc(100vw - 24px)); max-height:calc(100dvh - 24px); overflow:hidden;
        display:flex; flex-direction:column; color:#f3f4f6; background:rgba(8,10,15,.96);
        border:1px solid #3f4652; border-radius:12px; box-shadow:0 12px 35px rgba(0,0,0,.42);
        font:13px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; direction:ltr; text-align:left;
        backdrop-filter:blur(10px); }
      .li-panel *, .li-reopen { box-sizing:border-box; }
      .li-header { min-height:42px; display:flex; align-items:center; justify-content:space-between;
        padding:8px 10px; border-bottom:1px solid #303641; flex-shrink:0; }
      .li-tabs { display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; padding:7px 8px;
        border-bottom:1px solid #303641; flex-shrink:0; }
      .li-tab { border:1px solid #3b4350; border-radius:7px; padding:6px 4px; background:#171a21;
        color:#cbd5e1; font:600 11px ui-monospace,monospace; cursor:pointer; }
      .li-tab[aria-selected="true"] { color:#05230f; border-color:#4ade80; background:#4ade80; }
      .li-pane { padding:10px; overflow:auto; overscroll-behavior:contain; min-height:0; }
      .li-panel[data-mode="compact"] { width:auto; max-width:calc(100vw - 24px); }
      .li-panel[data-mode="compact"] .li-header { border-bottom:0; min-height:38px; gap:10px; }
      .li-panel[data-mode="compact"] .li-tabs, .li-panel[data-mode="compact"] #legionnaire-insights-tools,
      .li-panel[data-mode="compact"] #legionnaire-insights-agents { display:none!important; }
      .li-panel[data-mode="compact"] #legionnaire-insights-content { padding:0 10px 9px; overflow:hidden; white-space:nowrap; }
      .li-btn { background:#20242c; color:#f3f4f6; border:1px solid #4b5563; border-radius:6px;
        min-width:25px; height:25px; padding:0 6px; font:700 13px ui-monospace,monospace; cursor:pointer; }
      @media (max-width: 640px) {
        .li-panel[data-mode="full"] { top:auto; bottom:8px; left:8px; width:calc(100vw - 16px);
          max-height:min(62dvh, 560px); border-radius:16px; }
        .li-panel[data-mode="compact"] { top:auto; bottom:10px; left:10px; }
        .li-pane { font-size:13px; line-height:1.55; }
        .li-tab { min-height:36px; font-size:12px; }
      }
      @media (max-height: 650px) and (min-width: 641px) {
        .li-panel[data-mode="full"] { max-height:calc(100dvh - 16px); top:8px; }
      }
    `;
    document.head.appendChild(style);

    const header = document.createElement('div');
    header.id = 'legionnaire-insights-header';
    header.className = 'li-header';
    panel.appendChild(header);

    const tabs = document.createElement('div');
    tabs.id = 'legionnaire-insights-tabs';
    tabs.className = 'li-tabs';
    for (const [id, label] of [['now', 'עכשיו'], ['tools', 'כלים'], ['agents', 'סוכנים']]) {
      const button = document.createElement('button');
      button.className = 'li-tab';
      button.dataset.tab = id;
      button.textContent = label;
      button.addEventListener('click', () => setTab(id));
      tabs.appendChild(button);
    }
    panel.appendChild(tabs);

    const content = document.createElement('div');
    content.id = 'legionnaire-insights-content';
    content.className = 'li-pane';
    panel.appendChild(content);

    // Seed tools: a separate, persistent section (never touched by render()'s
    // innerHTML rewrite, so its inputs/results survive every poll tick).
    const tools = document.createElement('div');
    tools.id = 'legionnaire-insights-tools';
    tools.className = 'li-pane';
    tools.innerHTML = `
      <div style="padding-bottom:8px; margin-bottom:8px; border-bottom:1px solid #333;">
        <b style="color:#4ade80">Script updates</b>
        <div id="li-update-status" style="margin:4px 0; font-size:10px; color:#9ca3af;">Installed version ${currentScriptVersion()}</div>
        <div style="display:flex; gap:4px;">
          <button id="li-check-update" style="flex:1; background:#222; color:#e5e7eb; border:1px solid #444; border-radius:4px; padding:4px; font:10px monospace; cursor:pointer;">Check now</button>
          <a id="li-install-update" href="${SCRIPT_UPDATE_URL}" target="_blank" rel="noopener noreferrer" style="display:none; flex:1; background:#facc15; color:#211900; border-radius:4px; padding:4px; font:bold 10px monospace; text-align:center; text-decoration:none;">Install update</a>
        </div>
      </div>
      <b style="color:#4ade80">Seed Finder</b><br>
      <div style="display:flex; gap:4px; margin:4px 0; flex-wrap:wrap;">
        <input id="li-targetpot" type="number" placeholder="potential" value="94" title="Target potential (exact)" style="width:56px; background:#0e0e12; color:#e5e7eb; border:1px solid #444; border-radius:4px; font:10px monospace;">
        <input id="li-startovr" type="number" placeholder="start ovr" value="76" title="Target starting overall (exact)" style="width:56px; background:#0e0e12; color:#e5e7eb; border:1px solid #444; border-radius:4px; font:10px monospace;">
        <select id="li-profile" style="background:#0e0e12; color:#e5e7eb; border:1px solid #444; border-radius:4px; font:10px monospace;">
          <option value="any">any</option>
          <option value="early">early</option>
          <option value="normal" selected>normal</option>
          <option value="late">late</option>
        </select>
      </div>
      <button id="li-search" style="background:#4ade80; color:#05230f; border:none; border-radius:4px; padding:4px 8px; font:10px monospace; cursor:pointer;">Find seeds</button>
      <div id="li-search-status" style="opacity:.6; margin-top:4px;"></div>
      <div id="li-results" style="margin-top:6px;"></div>
      <div style="border-top:1px solid #333; margin-top:8px; padding-top:8px;">
        <b style="color:#4ade80">Sync devices</b><br>
        <button id="li-cloud-sync" style="width:100%; margin-top:4px; background:#4ade80; color:#05230f; border:none; border-radius:4px; padding:5px; font:10px monospace; font-weight:bold; cursor:pointer;">☁ Sync Now</button>
        <label style="display:flex; align-items:center; gap:5px; margin-top:5px; font-size:9px; cursor:pointer;">
          <input id="li-auto-sync" type="checkbox" style="margin:0;"> Auto-sync in the background
        </label>
        <div id="li-sync-status" style="margin:4px 0; font-size:9px; color:#9ca3af;">Waiting for setup</div>
        <div style="opacity:.5; margin:4px 0; font-size:9px;">Syncs on startup, resume and after game progress. Covers both sports.</div>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <button id="li-export" style="flex:1; background:#222; color:#e5e7eb; border:1px solid #444; border-radius:4px; padding:3px; font:9px monospace; cursor:pointer;">Manual export</button>
          <button id="li-import" style="flex:1; background:#222; color:#e5e7eb; border:1px solid #444; border-radius:4px; padding:3px; font:9px monospace; cursor:pointer;">Manual import</button>
        </div>
        <button id="li-reset-cloud" style="width:100%; margin-top:4px; background:transparent; color:#666; border:none; font:9px monospace; cursor:pointer; text-decoration:underline;">reset cloud sync settings</button>
      </div>
    `;
    panel.appendChild(tools);

    const agents = document.createElement('div');
    agents.id = 'legionnaire-insights-agents';
    agents.className = 'li-pane';
    panel.appendChild(agents);

    tools.querySelector('#li-search').addEventListener('click', () => runSeedSearch());
    tools.querySelector('#li-check-update').addEventListener('click', () => checkForScriptUpdate(true));
    tools.querySelector('#li-export').addEventListener('click', () => doExport());
    tools.querySelector('#li-import').addEventListener('click', () => doImport());
    tools.querySelector('#li-cloud-sync').addEventListener('click', () => {
      checkForScriptUpdate(true);
      cloudSyncNow();
    });
    const autoSyncToggle = tools.querySelector('#li-auto-sync');
    autoSyncToggle.checked = isAutoSyncEnabled();
    autoSyncToggle.addEventListener('change', () => {
      GM_setValue(AUTO_SYNC_GM_KEY, autoSyncToggle.checked);
      setSyncStatus(autoSyncToggle.checked ? 'Auto-sync enabled' : 'Auto-sync paused', autoSyncToggle.checked ? '#4ade80' : '#9ca3af');
      if (autoSyncToggle.checked) scheduleAutoSync('manual-enable', 0);
    });
    tools.querySelector('#li-reset-cloud').addEventListener('click', () => resetCloudSettings());

    document.body.appendChild(panel);

    // Small reopen button, shown only when mode === 'hidden'
    const reopen = document.createElement('button');
    reopen.id = 'legionnaire-insights-reopen';
    reopen.className = 'li-reopen';
    reopen.textContent = 'LI';
    reopen.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 999999;
      width: 38px; height: 38px; border-radius: 50%; border: 1px solid #475569;
      background: rgba(10,10,15,0.95); color: #4ade80; font: bold 11px monospace;
      cursor: pointer; display: none; box-shadow:0 6px 18px rgba(0,0,0,.35);
    `;
    reopen.addEventListener('click', () => setMode('compact'));
    document.body.appendChild(reopen);

    return panel;
  }

  function runSeedSearch() {
    const targetPot = Number(document.getElementById('li-targetpot').value) || 94;
    const targetOvr = Number(document.getElementById('li-startovr').value) || 76;
    const profile = document.getElementById('li-profile').value;
    const statusEl = document.getElementById('li-search-status');
    const resultsEl = document.getElementById('li-results');
    resultsEl.innerHTML = '';

    let tries = 0, found = 0;
    const maxTries = 500000, maxResults = 8, batchSize = 15000;

    function batch() {
      for (let i = 0; i < batchSize && tries < maxTries && found < maxResults; i++, tries++) {
        const seed = randomSeedString();
        const r = computeCreation(seed);
        if (r.potential !== targetPot) continue;
        if (r.startingOverall !== targetOvr) continue;
        if (profile !== 'any' && r.developmentProfile !== profile) continue;
        found++;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:4px; margin-bottom:3px;';
        row.innerHTML = `
          <span style="color:#facc15; font-weight:bold; width:22px;">${r.potential}</span>
          <span style="opacity:.7; width:60px;">ovr ${r.startingOverall}${r.elite ? ' *' : ''}</span>
          <span style="opacity:.7; width:44px;">${r.developmentProfile}</span>
          <button data-seed="${seed}" style="background:#222; color:#4ade80; border:1px solid #444; border-radius:4px; padding:2px 6px; font:10px monospace; cursor:pointer;">Apply</button>
        `;
        row.querySelector('button').addEventListener('click', (ev) => {
          const sport = getCurrentSport();
          if (!confirm(`This will overwrite your current ${sport} save with a fresh career using this seed, and reload the page. Continue?`)) return;
          applySeedAndReload(ev.target.getAttribute('data-seed'));
        });
        resultsEl.appendChild(row);
      }
      statusEl.textContent = `checked ${tries.toLocaleString()}, found ${found}`;
      if (tries < maxTries && found < maxResults) {
        setTimeout(batch, 0);
      } else {
        statusEl.textContent = `done: checked ${tries.toLocaleString()}, found ${found}`;
      }
    }
    batch();
  }

  function buildChrome() {
    const panel = ensurePanel();
    const header = document.getElementById('legionnaire-insights-header');
    const content = document.getElementById('legionnaire-insights-content');
    const tools = document.getElementById('legionnaire-insights-tools');
    const agents = document.getElementById('legionnaire-insights-agents');
    const tabs = document.getElementById('legionnaire-insights-tabs');
    const reopen = document.getElementById('legionnaire-insights-reopen');
    const mode = getMode();

    if (mode === 'hidden') {
      panel.style.display = 'none';
      reopen.style.display = 'block';
      return;
    }
    panel.style.display = 'flex';
    reopen.style.display = 'none';
    panel.dataset.mode = mode;
    const activeTab = getTab();
    tabs.style.display = mode === 'compact' ? 'none' : 'grid';
    content.style.display = mode === 'compact' || activeTab === 'now' ? 'block' : 'none';
    tools.style.display = mode === 'full' && activeTab === 'tools' ? 'block' : 'none';
    agents.style.display = mode === 'full' && activeTab === 'agents' ? 'block' : 'none';
    tabs.querySelectorAll('.li-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === activeTab)));

    header.innerHTML = '';
    const title = document.createElement('b');
    title.style.color = '#4ade80';
    title.textContent = mode === 'compact' ? 'LI' : 'Legionnaire Insights';
    header.appendChild(title);

    if (hasScriptUpdate()) {
      const updateLink = document.createElement('a');
      updateLink.href = SCRIPT_UPDATE_URL;
      updateLink.target = '_blank';
      updateLink.rel = 'noopener noreferrer';
      updateLink.textContent = `↑ ${latestScriptVersion}`;
      updateLink.title = `Install Legionnaire Insights ${latestScriptVersion}`;
      updateLink.style.cssText = 'margin-left:auto; margin-right:8px; color:#facc15; font-weight:bold; text-decoration:none;';
      header.appendChild(updateLink);
    }

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex; gap:4px;';

    const mkBtn = (label, title_, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title_;
      b.className = 'li-btn';
      b.addEventListener('click', onClick);
      return b;
    };

    if (mode === 'full') {
      btns.appendChild(mkBtn('−', 'Compact mode', () => setMode('compact')));
    } else {
      btns.appendChild(mkBtn('+', 'Full mode', () => setMode('full')));
    }
    btns.appendChild(mkBtn('×', 'Hide', () => setMode('hidden')));
    header.appendChild(btns);
  }

  // ---------- Rendering ----------

  function render() {
    const mode = getMode();
    if (mode === 'hidden') return; // nothing to draw

    let results;
    try {
      results = scan();
    } catch (e) {
      return; // page structure changed after a deploy - fail quietly
    }

    // Prefer the one props object that represents the LIVE, interactive
    // decision screen (has both `decision` and `onChoose`). Other fibers
    // in the tree can carry stale/historical `decision` data (e.g. a past
    // choice shown in a log), so onChoose is what distinguishes "this is
    // the thing on screen right now that you can actually click".
    const live = results.find((p) => p.decision && 'onChoose' in p);
    let player = live ? live.player : null;
    let decision = live ? live.decision : null;

    if (!player) {
      for (const p of results) {
        if (p.player && p.player.potential !== undefined) { player = p.player; break; }
      }
    }
    if (!decision) {
      for (const p of results) {
        if (p.decision) { decision = p.decision; break; }
      }
    }

    ensurePanel();
    const content = document.getElementById('legionnaire-insights-content');
    const agents = document.getElementById('legionnaire-insights-agents');
    if (!content) return;

    if (!clubsById && !clubsLoadPromise) loadClubsDb();

    if (agents) {
      const agentLines = ['<b style="color:#4ade80">סוכנים</b>', '<span style="opacity:.65">מידע קבוע לעיון — מוסתר מהמסך הראשי.</span>', ''];
      AGENTS.forEach((a) => {
        agentLines.push(`<b>${a.name}</b>`);
        agentLines.push(`<span style="opacity:.72">תנאי: ${a.cond}</span>`);
        agentLines.push(a.bonus);
        if (a.clubIds) agentLines.push(`<span style="opacity:.78">קבוצות: ${a.clubIds.map(describeClub).join(' · ')}</span>`);
        agentLines.push('');
      });
      agents.innerHTML = agentLines.join('<br>');
    }

    const lines = [];

    if (mode === 'compact') {
      // Just the potential (and the gap) - Overall is already shown in-game.
      if (player) {
        const gap = player.potential - player.overall;
        lines.push(`POT <b style="color:#facc15">${player.potential}</b> <span style="opacity:.7">Δ${gap} · ${player.developmentProfile}</span>`);
      } else {
        lines.push('(no player data)');
      }
      content.innerHTML = lines.join('<br>');
      return;
    }

    // full mode
    if (player) {
      lines.push('<b>Player</b>');
      lines.push(`Overall: ${player.overall}`);
      lines.push(`Potential: <b style="color:#facc15">${player.potential}</b>`);
      lines.push(`Gap to potential: ${player.potential - player.overall}`);
      lines.push(`Development profile: ${player.developmentProfile}`);
      lines.push(`Age: ${player.age} | Pos: ${player.position}`);
    } else {
      lines.push('(no player data on this screen)');
    }

    if (decision) {
      lines.push('');
      lines.push(`<b>Decision</b>: ${decision.kind}`);
      if (decision.options) {
        decision.options.forEach((o, i) => {
          const clubText = o.clubId ? describeClub(o.clubId) : null;
          const optName = o.label || o.kind || o.key || o.id;
          lines.push(`&nbsp;&nbsp;${i + 1}. ${optName}${clubText ? ' &rarr; ' + clubText : ''}`);
          if (o.outcomes && o.outcomes.length > 1) {
            o.outcomes.forEach((out) => {
              const pct = Math.round(out.probability * 100);
              const effectsText = out.effects ? JSON.stringify(out.effects) : '';
              lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;- ${pct}% ${out.resultLabel} <span style="opacity:.6">${effectsText}</span>`);
            });
            lines.push('&nbsp;&nbsp;&nbsp;&nbsp;<span style="opacity:.6">(roll happens on click)</span>');
          }
        });
      }
    }

    content.innerHTML = lines.join('<br>');
  }

  // Plain polling only - NOT a MutationObserver on document.body, because
  // updating the panel's own innerHTML would itself trigger the observer
  // and create an infinite render loop that freezes the tab.
  loadClubsDb();
  window.addEventListener('load', () => loadClubsDb());
  buildChrome();
  renderUpdateStatus();
  setTimeout(() => checkForScriptUpdate(), 1200);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForScriptUpdate();
  });
  maybeAutoContinue();
  initAutoSync();
  setInterval(render, 700);
  window.addEventListener('load', render);
  render();
})();
