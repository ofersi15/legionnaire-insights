# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `7.8.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Fixed career POT is derived from the active seed and shown in a tiny draggable floating `LI · POT` HUD.
- Tapping the HUD opens the quick menu; full Details/Agents/Tools/Sync remain in the secondary core panel on demand.
- Club strength is shown only as `OVR NN` on visible transfer-choice cards, with the strongest visible offer outlined. Tier text is intentionally omitted.
- Club data is cached locally after the first live-bundle parse so later transfer screens can annotate immediately.
- Native Seed Finder uses a Web Worker and can apply a chosen seed by rebuilding the active save and reloading.
- LI can be fully hidden; a small low-opacity `LI` restore button remains in the top-left.
- The old compact core panel, if explicitly opened, is forced to floating positioning and is draggable with remembered position.
- Automatic cross-device synchronization plus manual export/import fallback.
- Hourly version awareness on startup/resume and manual sync, with an in-panel install link when GitHub has a newer release.

## Runtime layout

`legionnaire-insights.user.js` currently `@require`s three runtimes:

- `runtime/perf-gate-7.8.0.js` — narrowly intercepts only the frozen core's `setInterval(render, 700)` loop. The callback runs every 1.5s only while the secondary panel is actually visible, eliminating hidden-panel React-tree scans during normal gameplay.
- `runtime/legionnaire-insights-core-7.2.0.js` — unchanged sync/update implementation plus verbose Details/Agents/Tools panel.
- `runtime/native-ui-7.8.0.js` — floating POT HUD, cached club OVR annotations, quick menu, native Seed Finder, hide/restore and compact-panel dragging.

The 7.3–7.7 native UI runtimes are no longer required or executed. In particular, the brittle attempt to find/inject into the game's OVR tile was removed. Normal gameplay now has no full React-tree scan from native UI, no root MutationObserver, and no generic decision-button injection.

Club annotation is event-driven: cached data is used immediately, and short refresh bursts run after user actions or active-save changes. The expensive game bundle is reparsed only when its hashed script URL changes.

## Important game keys

| Key suffix | Meaning | Merge rule |
| --- | --- | --- |
| `football:save:v2` | Active football career | Same seed: longer `choices`; different seed: keep local |
| `basketball:save:v2` | Active basketball career | Same rule |
| `football:careers:v1` | Completed football careers | Union by `seed` |
| `basketball:careers:v1` | Completed basketball careers | Union by `seed` |
| `collection:v1` | Football collection/stats | Per-device numeric ledger |
| `basketball:collection:v2` | Basketball collection/stats | Per-device numeric ledger |
| `careers-completed:v1` | Combined completed count | Per-device numeric ledger |

`sport:v1` and `currency:v1` are device UI preferences and are excluded.

## Sync v3

Each browser has a stable random device ID. It writes one Gist file named:

`legionnaire-device-<deviceId>.snapshot.json`

The file wraps the existing logical `__legSync: 2` payload with schema/device metadata, update timestamp, state hash, gzip/base64 payload and SHA-256 verification. A sync performs one authenticated Gist metadata GET, merges all device snapshots locally, and PATCHes only this device's file if its state hash changed. Different active-career seeds never silently overwrite one another.

On the first v7 run, if no device snapshot exists, the script imports the seven legacy v6.15 chunk files and publishes the first v3 snapshot. Legacy files remain for compatibility.

Auto-sync triggers on startup, resume, five seconds after detected local changes, and every three minutes while visible. Startup/resume may reload once when remote data changed and there was no user interaction during the request.

## Authentication

The Gist token requires only **Gists: Read and write**. Tokens live in Tampermonkey-private `GM_*Value`, never page `localStorage`.

## Release flow

1. Modify userscript/runtime.
2. Increment `@version`.
3. Run syntax and sync-focused tests.
4. Update `CHANGELOG.md`; update this file for behavior/architecture changes.
5. Commit deployable files to `main`.
6. Confirm GitHub Actions validation and read back the wrapper header/raw URL.

## Near-term cleanup

- Validate 7.8 performance on Firefox Android over several consecutive decision screens.
- Confirm cached `OVR NN` badges appear effectively immediately on subsequent transfer windows.
- Validate draggable HUD and compact secondary panel on mobile and desktop.
- Inspect the game's probabilistic decision handler before implementing deterministic outcome selection; do not globally patch randomness.
- After both device snapshot files are proven stable, remove dormant v6.15 chunk transport.
