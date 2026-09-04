'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

const runtimePath = path.join(__dirname, '..', 'runtime', 'legionnaire-insights-8.1.0.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');
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
assert.doesNotMatch(runtime, /__reactFiber/, 'deployed runtime must not scan React fibers');

console.log('v8 UI logic tests: OK');
