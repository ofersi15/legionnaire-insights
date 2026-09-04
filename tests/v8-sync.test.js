'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

class StorageMock {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const localStorage = new StorageMock();
const LEDGER_META_KEY = 'maslul-kariera-sync:ledger:v3';
const DEVICE_ID_KEY = 'maslul-kariera-sync:device-id';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = 'device-a'; localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}
function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
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
  for (const [devId, val] of Object.entries(remoteLedger || {})) {
    if (devId !== myId) entry.ledger[devId] = Math.max(entry.ledger[devId] || 0, Number(val) || 0);
  }
  const total = Object.values(entry.ledger).reduce((a, b) => a + (Number(b) || 0), 0);
  localStorage.setItem(key, String(total));
  entry.lastWritten = total;
  meta.numbers[key] = entry;
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
  } catch {}
  return targetRaw;
}
function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
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
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return Buffer.from(binary, 'binary').toString('base64');
}
function base64ToBytes(text) { return Uint8Array.from(Buffer.from(text, 'base64')); }
async function encodeSnapshotText(text) {
  if (typeof CompressionStream !== 'function') return { encoding: 'plain-base64', data: bytesToBase64(new TextEncoder().encode(text)) };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { encoding: 'gzip-base64', data: bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer())) };
}
async function decodeSnapshotText(wrapper) {
  const bytes = base64ToBytes(wrapper.data || '');
  if (wrapper.encoding === 'plain-base64') return new TextDecoder().decode(bytes);
  if (wrapper.encoding !== 'gzip-base64' || typeof DecompressionStream !== 'function') throw new Error('Unsupported encoding');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
async function packSnapshot(payload, deviceId) {
  const text = JSON.stringify(payload);
  const encoded = await encodeSnapshotText(text);
  return JSON.stringify({ schema: 3, deviceId, updatedAt: 1, stateHash: await sha256Hex(JSON.stringify({ ...payload, ts: 0 })), payloadHash: await sha256Hex(text), encoding: encoded.encoding, data: encoded.data });
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
function deviceFilename(id) { return `legionnaire-device-${id}.snapshot.json`; }

(async () => {
  const local = JSON.stringify({ seed: 'same', choices: ['a'] });
  const remote = JSON.stringify({ seed: 'same', choices: ['a', 'b', 'c'] });
  assert.equal(chooseActiveSave(local, remote), remote, 'same-seed longer save must advance');
  assert.equal(chooseActiveSave(local, JSON.stringify({ seed: 'other', choices: ['x', 'y'] })), local, 'different seeds must keep local');

  assert.deepEqual(unionBySeed([{ seed: 'a' }, { seed: 'b' }], [{ seed: 'b' }, { seed: 'c' }]).map((x) => x.seed), ['a', 'b', 'c']);

  localStorage.setItem(DEVICE_ID_KEY, 'device-a');
  localStorage.setItem('maslul-kariera:careers-completed:v1', '1');
  mergeNumberKey('maslul-kariera:careers-completed:v1', { 'device-b': 2 });
  assert.equal(localStorage.getItem('maslul-kariera:careers-completed:v1'), '3');
  mergeNumberKey('maslul-kariera:careers-completed:v1', { 'device-b': 2 });
  assert.equal(localStorage.getItem('maslul-kariera:careers-completed:v1'), '3', 'repeated merge must be idempotent');

  assert.notEqual(deviceFilename('device-a'), deviceFilename('device-b'), 'devices must own independent snapshot filenames');

  const payload = { __legSync: 2, ts: 123, ledgers: { numbers: {}, maps: {} }, data: { 'maslul-kariera:football:careers:v1': '[{"seed":"a"}]' } };
  const packed = await packSnapshot(payload, 'device-a');
  const roundTrip = await unpackSnapshot(packed);
  assert.deepEqual(roundTrip.payload, payload, 'snapshot compression round-trip must preserve payload');

  const tampered = JSON.parse(packed);
  tampered.payloadHash = '00'.repeat(32);
  await assert.rejects(() => unpackSnapshot(JSON.stringify(tampered)), /checksum/i, 'checksum mismatch must be rejected');

  console.log('v8 sync tests: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
