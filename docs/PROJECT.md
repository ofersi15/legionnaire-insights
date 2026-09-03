# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `7.1.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Hidden overall, potential, development profile, age and position.
- Club name/tier/overall lookup from the live Vite bundle.
- Agent reference table and probabilistic decision previews.
- Responsive overlay with compact, tabbed and hidden modes; expanded mobile view is a bottom sheet.
- Seed Finder with apply-and-reload.
- Automatic cross-device synchronization plus manual export/import fallback.

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

1. Modify the userscript.
2. Increment `@version`.
3. Run syntax and sync-focused tests.
4. Update `CHANGELOG.md`; update this file only for architectural changes.
5. Commit the deployable file to `main`.
6. Confirm the GitHub Actions validation and read back the file header/raw URL.

Tampermonkey detects a higher `@version` from the raw URL. Script Sync may additionally be enabled in Tampermonkey on both browsers, but it is not used for game-save data.

## Near-term cleanup

- Validate v7 migration and background behavior on both real devices.
- After both device snapshot files exist and are proven stable, remove the dormant v6.15 chunk transport.
- If active careers with different seeds must be handed off, add explicit conflict selection; never use silent last-write-wins.
