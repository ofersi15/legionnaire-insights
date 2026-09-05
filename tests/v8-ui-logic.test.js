'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class StorageMock {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const storage = new StorageMock();
const FOOTBALL = 'maslul-kariera:football:save:v2';
const BASKETBALL = 'maslul-kariera:basketball:save:v2';
const LEGACY = 'maslul-kariera:save:v1';

function readJson(key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function activeSaveRecord(sport) {
  const preferred = sport === 'basketball' ? BASKETBALL : FOOTBALL;
  const other = sport === 'basketball' ? FOOTBALL : BASKETBALL;
  for (const key of [preferred, LEGACY, other]) {
    const save = readJson(key, null);
    if (save && typeof save === 'object' && save.seed != null && save.seed !== '') return { key, save };
  }
  return null;
}

storage.setItem(LEGACY, JSON.stringify({ seed: 'legacy-football', choices: [] }));
assert.equal(activeSaveRecord('football').key, LEGACY, 'football must fall back to the real legacy save key');

storage.setItem(FOOTBALL, JSON.stringify({ seed: 'v2-football', choices: [] }));
assert.equal(activeSaveRecord('football').key, FOOTBALL, 'sport-specific v2 save must win when present');

storage.clear();
storage.setItem(FOOTBALL, '{broken');
storage.setItem(LEGACY, JSON.stringify({ seed: 'legacy-after-broken-v2', choices: [] }));
assert.equal(activeSaveRecord('football').key, LEGACY, 'invalid v2 JSON must not block the legacy fallback');

storage.clear();
storage.setItem(BASKETBALL, JSON.stringify({ seed: 'basketball', choices: [] }));
assert.equal(activeSaveRecord('basketball').key, BASKETBALL, 'basketball should use its own v2 save');

storage.clear();
storage.setItem(LEGACY, JSON.stringify({ choices: [] }));
assert.equal(activeSaveRecord('football'), null, 'a stale object without a seed is not an active save');

const runtimePath = path.join(__dirname, '..', 'runtime', 'legionnaire-insights-8.2.2.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');
const wrapper = fs.readFileSync(path.join(__dirname, '..', 'legionnaire-insights.user.js'), 'utf8');
const breakpointMatch = runtime.match(/const DESKTOP_MIN_WIDTH = (\d+);/);
assert.ok(breakpointMatch, 'desktop breakpoint must be explicit and testable');
const desktopMinWidth = Number(breakpointMatch[1]);
const desktopLayout = (width, finePointer) => width >= desktopMinWidth && finePointer;

assert.equal(desktopLayout(1920, true), true, '1920px fine-pointer viewport uses the desktop toolbar');
assert.equal(desktopLayout(1440, true), true, '1440px fine-pointer viewport uses the desktop toolbar');
assert.equal(desktopLayout(1024, true), true, 'narrow laptop viewport keeps the desktop toolbar');
assert.equal(desktopLayout(450, true), false, '450px viewport keeps the mobile HUD');
assert.equal(desktopLayout(412, true), false, 'common Android viewport keeps the mobile HUD');
assert.equal(desktopLayout(1200, false), false, 'large coarse-pointer devices keep the draggable HUD');
assert.match(runtime, /data-toolbar-action="details"/, 'desktop toolbar exposes Details');
assert.match(runtime, /data-toolbar-action="seed"/, 'desktop toolbar exposes Seed Finder');
assert.match(runtime, /data-toolbar-action="main"/, 'desktop toolbar exposes tools and Sync');
assert.match(runtime, /toolbarAnchor\.insertBefore\(hud, trophyCase \|\| null\)/, 'toolbar is inserted inside the player card before the trophy case');
assert.doesNotMatch(runtime, /setInterval/, 'deployed runtime must not poll');
assert.match(runtime, /document\.querySelectorAll\('\.decision \.option--personal'\)/, 'prediction lookup must start from visible decision cards');
assert.match(runtime, /depth < 8/, 'React lookup must have a small hard traversal bound');
assert.match(runtime, /fiber\.alternate \? \[fiber, fiber\.alternate\] : \[fiber\]/, 'prediction lookup must inspect the current React alternate');
assert.match(runtime, /startsWith\(decisionPrefix\)/, 'prediction props must belong to the active seed and step');
assert.doesNotMatch(runtime, /fiber\.(child|sibling)/, 'prediction lookup must never traverse the React tree');
assert.doesNotMatch(runtime, /querySelectorAll\(['"]\*['"]\)/, 'prediction lookup must never scan every DOM element');
assert.match(wrapper, /^\/\/ @grant\s+unsafeWindow$/m, 'wrapper must expose the page bridge for Chrome and Firefox userscript sandboxes');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `runtime function ${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`runtime function ${name} is not balanced`);
}

const clubContext = {};
vm.runInNewContext(`
  let currentSport = 'football';
  const sport = () => currentSport;
  const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  let clubByName = null;
  let clubById = null;
  let clubItems = [];
  let clubMapSport = '';
  let clubSource = '';
  ${extractFunction(runtime, 'rebuildClubMaps')}
  const fixture = [
    { sport: 'football', id: 'cy-olympiakos-nicosia', name: 'אולימפיאקוס ניקוסיה', shortName: 'אולימפיאקוס', ovr: 70 },
    { sport: 'football', id: 'gr-olympiacos', name: 'אולימפיאקוס', shortName: 'אולימפיאקוס', ovr: 84 },
    { sport: 'basketball', id: 'gr-olympiacos', name: 'אולימפיאקוס', shortName: 'אולימפיאקוס', ovr: 90 },
  ];
  rebuildClubMaps(fixture, 'fixture');
  globalThis.football = {
    olympiacos: clubByName.get('אולימפיאקוס').ovr,
    nicosia: clubByName.get('אולימפיאקוס ניקוסיה').ovr,
    byId: clubById.get('gr-olympiacos').ovr,
  };
  currentSport = 'basketball';
  rebuildClubMaps(fixture, 'fixture');
  globalThis.basketball = {
    olympiacos: clubByName.get('אולימפיאקוס').ovr,
    byId: clubById.get('gr-olympiacos').ovr,
  };
`, clubContext);
assert.equal(clubContext.football.olympiacos, 84, 'football Olympiacos must not inherit the basketball rating');
assert.equal(clubContext.football.nicosia, 70, 'the full Nicosia name must remain independently addressable');
assert.equal(clubContext.football.byId, 84, 'sport-scoped football IDs must resolve to the football club');
assert.equal(clubContext.basketball.olympiacos, 90, 'basketball Olympiacos must retain its basketball rating');
assert.equal(clubContext.basketball.byId, 90, 'sport-scoped basketball IDs must resolve to the basketball club');

const wrapperClubContext = {};
vm.runInNewContext(`
  let activeSport = 'football';
  const CLUB_CACHE_KEY = 'legionnaire-insights:club-cache-v4';
  const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const items = [
    { sport: 'football', name: 'אולימפיאקוס ניקוסיה', shortName: 'אולימפיאקוס', ovr: 70 },
    { sport: 'football', name: 'אולימפיאקוס', shortName: 'אולימפיאקוס', ovr: 84 },
    { sport: 'basketball', name: 'אולימפיאקוס', shortName: 'אולימפיאקוס', ovr: 90 },
  ];
  const localStorage = {
    getItem(key) {
      if (key === CLUB_CACHE_KEY) return JSON.stringify({ items });
      if (key === 'maslul-kariera:sport:v1') return activeSport;
      return null;
    },
  };
  ${extractFunction(wrapper, 'cachedClubAliases')}
  globalThis.football = cachedClubAliases().get('אולימפיאקוס').ovr;
  activeSport = 'basketball';
  globalThis.basketball = cachedClubAliases().get('אולימפיאקוס').ovr;
`, wrapperClubContext);
assert.equal(wrapperClubContext.football, 84, 'single-club fallback must use the football full-name rating');
assert.equal(wrapperClubContext.basketball, 90, 'single-club fallback must switch to the basketball rating');

const sportDetectionContext = {};
vm.runInNewContext(`
  ${extractFunction(runtime, 'detectedClubSport')}
  globalThis.results = [
    detectedClubSport([['gr-olympiacos', 'אולימפיאקוס', 'אולימפיאקוס', 'GR']]),
    detectedClubSport([['gr-olympiacos', 'אולימפיאקוס', 'אולימפיאקוס', 'gr']]),
    detectedClubSport([{ id: 'il-football', source: { clubId: 1 } }]),
    detectedClubSport([{ id: 'il-basketball', source: { provider: 'fixture' } }]),
  ];
`, sportDetectionContext);
assert.deepEqual(Array.from(sportDetectionContext.results), ['football', 'basketball', 'football', 'basketball'], 'club tables must be assigned to their source sport');
assert.match(runtime, /itemsById\.set\(`\$\{parsedSport\}:\$\{item\.id\}`/, 'identical club IDs must be retained separately per sport');
assert.match(wrapper, /legionnaire-insights:club-cache-v4/, 'single-club fallback must read the sport-aware cache');

const lookupContext = { unsafeWindow: undefined };
vm.runInNewContext(`
  const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  ${extractFunction(runtime, 'propsMatchVisibleCard')}
  ${extractFunction(runtime, 'localDecisionProps')}
  globalThis.lookup = localDecisionProps;
`, lookupContext);

const currentOption = {
  id: 'visible-option',
  label: 'האפשרות הנוכחית',
  outcomes: [
    { probability: 0.7, resultLabel: 'התוצאה הטובה' },
    { probability: 0.3, resultLabel: 'התוצאה הרעה' },
  ],
};
const staleOption = {
  id: 'previous-option',
  label: currentOption.label,
  outcomes: [
    { probability: 0.5, resultLabel: currentOption.outcomes[0].resultLabel },
    { probability: 0.5, resultLabel: currentOption.outcomes[1].resultLabel },
  ],
};
const currentProps = { decision: { id: 'fixture-seed-4-current' }, option: currentOption };
const staleProps = { decision: { id: 'fixture-seed-3-previous' }, option: staleOption };
const fakeCard = {
  wrappedJSObject: null,
  querySelector(selector) {
    return selector === '.option__name' ? { textContent: currentOption.label } : null;
  },
  querySelectorAll(selector) {
    return selector === '.pill'
      ? currentOption.outcomes.map((outcome) => ({ firstElementChild: { textContent: outcome.resultLabel } }))
      : [];
  },
};
fakeCard['__reactFiber$fixture'] = {
  memoizedProps: null,
  return: { memoizedProps: staleProps, alternate: { memoizedProps: currentProps } },
};
assert.equal(lookupContext.lookup(fakeCard, 0, 'fixture-seed', 4).option.id, currentOption.id, 'lookup must reject stale props and select the alternate matching the active decision');
fakeCard['__reactFiber$fixture'].return.alternate.memoizedProps = staleProps;
assert.equal(lookupContext.lookup(fakeCard, 0, 'fixture-seed', 4), null, 'lookup must fail closed when neither fiber belongs to the active decision');

function seedHash(text) {
  let state = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { state ^= text.charCodeAt(i); state = Math.imul(state, 16777619); }
  return state >>> 0;
}

function seededDraw(seed) {
  const state = ((seedHash(seed) || 1) + 1831565813) >>> 0;
  let n = state;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function predictedIndex(seed, step, option) {
  const draw = seededDraw(`${seed}-${step}-apply-${option.id}`);
  let cumulative = 0;
  for (let index = 0; index < option.outcomes.length; index++) {
    cumulative += option.outcomes[index].probability;
    if (draw < cumulative) return index;
  }
  return option.outcomes.length - 1;
}

const threeOutcomeOption = {
  id: 'LATE_SALARY-report-to-tax-authority',
  outcomes: [{ probability: 0.6 }, { probability: 0.2 }, { probability: 0.2 }],
};
const originalOutcomes = JSON.stringify(threeOutcomeOption);
assert.equal(predictedIndex('toolbar-live-fixture', 7, threeOutcomeOption), 0, 'three-outcome preview selects the first band');
assert.equal(predictedIndex('fixture-9', 7, threeOutcomeOption), 1, 'three-outcome preview selects the middle band');
assert.equal(predictedIndex('fixture-6', 7, threeOutcomeOption), 2, 'three-outcome preview selects the final band');
assert.equal(JSON.stringify(threeOutcomeOption), originalOutcomes, 'prediction must not mutate outcomes or probabilities');
assert.match(runtime, /localStorage\.getItem\(PREDICTIONS_KEY\) === '1'/, 'predictions must default off and require explicit opt-in');
assert.match(runtime, /Array\.isArray\(save\.choices\) \? save\.choices\.length : null/, 'prediction step must use the active save replay cursor');
assert.match(runtime, /היא אינה משנה את המשחק או את השמירה/, 'the UI must disclose that preview is read-only');

console.log('v8 UI logic tests: OK');
