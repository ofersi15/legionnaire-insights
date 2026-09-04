# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `7.6.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Hidden player potential/development plus on-demand verbose player/decision detail.
- Club name/tier/overall lookup from the live Vite bundle.
- Agent reference table and probabilistic decision previews in the secondary panel.
- Native club-choice annotations for tier/overall and strongest visible offer without changing card layout.
- Fixed career POT shown inside the existing OVR tile; only that exact tile opens/restores the LI quick menu.
- Native Seed Finder with remembered targets, inline results, apply-and-reload and a new-career entry point.
- Automatic cross-device synchronization plus manual export/import fallback.
- Hourly version awareness on startup/resume and manual sync, with an in-panel install link when GitHub has a newer release.

## Runtime layout

`legionnaire-insights.user.js` is a small Tampermonkey entry point. It currently `@require`s two repository runtimes:

- `runtime/legionnaire-insights-core-7.2.0.js` — frozen core containing sync, update checks, Seed Finder fallback, verbose details/agents/tools and the secondary panel.
- `runtime/native-ui-7.6.0.js` — low-overhead in-game presentation, native Seed Finder workflow and hide/restore behavior.

The old 7.3, 7.4 and 7.5 UI runtimes are no longer required or executed. 7.6 removes the 7.5 root `MutationObserver`; presentation refreshes primarily when the active save changes, plus visibility and a 12-second recovery refresh. This avoids rescanning the DOM after every React subtree mutation on Firefox Android.

POT/development are derived from the active career seed; POT is fixed for the career. Current OVR is read from the compact visible OVR tile. The quick-menu listener is attached directly to that exact tile rather than using a delegated ancestor heuristic.

Club choices are matched by visible club-name text against the live club DB only during a refresh. Metadata is rendered as short absolutely positioned DOM badges (`T1 · 84`) and strongest-club outlining; injected nodes remain out of flow and must not change card dimensions. Generic probabilistic decision buttons are not modified.

Seed search uses a Web Worker when available; its fallback uses small idle-time batches so it does not monopolize the game thread.

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

The file wraps the existing logical `__legSync: 2` payload with:

- schema version and device ID;
- update timestamp and state hash;
- gzip-compressed, base64-encoded payload;
- SHA-256 payload checksum.

A sync performs one authenticated Gist metadata GET, decodes all device snapshots, merges them locally, and PATCHes only this device's file if the state hash changed. Independent files remove last-writer collisions. Compression avoids the Firefox-Android bridge truncation previously observed near 944KB.

On the first v7 run, if no device snapshot exists, the script reads the seven legacy v6.15 chunk files, merges them and publishes the first v3 snapshot. Legacy files are not deleted automatically.

Auto-sync triggers on startup, resume, five seconds after detected local changes, and every three minutes while visible. Startup/resume may reload once when remote data changed and there was no user interaction during the request.

## Authentication

The Gist token requires only **Gists: Read and write**. v7 migrates the old `legionnaire-insights:gh-token` value from page `localStorage` into Tampermonkey-private `GM_setValue` storage, then removes the old value.

## Release flow

1. Modify the userscript/runtime.
2. Increment `@version`.
3. Run syntax and sync-focused tests.
4. Update `CHANGELOG.md`; update this file only for architectural changes.
5. Commit the deployable file to `main`.
6. Confirm the GitHub Actions validation and read back the file header/raw URL.

Tampermonkey detects a higher `@version` from the raw URL. Script Sync may additionally be enabled in Tampermonkey on both browsers, but it is not used for game-save data.
The panel also checks the same raw URL at most hourly (or immediately on a manual check/sync). It can surface and open an update, but Tampermonkey remains responsible for installing it.

## Near-term cleanup

- Validate 7.6 performance on Firefox Android across several consecutive decision screens and transfer windows.
- Validate that POT is visible inside the exact OVR tile and that only that tile opens LI.
- Validate short club badges on narrow three-card mobile layouts.
- Inspect the live probabilistic decision handler before implementing any deterministic/forced outcome control; preserve the game's own save/event format rather than globally patching randomness.
- Validate native Seed Finder Worker behavior on Firefox Android and fallback behavior where Workers are blocked.
- Validate v7 migration and background behavior on both real devices.
- After both device snapshot files exist and are proven stable, remove the dormant v6.15 chunk transport.
- If active careers with different seeds must be handed off, add explicit conflict selection; never use silent last-write-wins.
