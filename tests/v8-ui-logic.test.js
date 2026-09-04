'use strict';

const assert = require('node:assert/strict');

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

console.log('v8 UI logic tests: OK');
