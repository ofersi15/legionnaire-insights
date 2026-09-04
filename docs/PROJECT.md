# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `8.0.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Fixed career POT is derived from the active seed and shown in a tiny draggable `LI · POT NN` HUD while an actual career/player UI is visible.
- Outside a career screen the HUD shows only `LI`; stale save data must never expose a fake POT.
- Mobile default HUD position is near the lower-left of the player header (`left: 20px`, `top: 62px`); dragging persists a custom position.
- Tapping the HUD opens one mobile-first bottom sheet. The legacy 7.2 overlay/panel is no longer loaded.
- Bottom-sheet sections: player Details, native Seed Finder, Agents, and Sync/Settings.
- Club-choice cards show only `OVR NN`, with the strongest visible offer outlined. Tier text is intentionally omitted.
- Club data is cached locally after the first live-bundle parse. Agent preferred-club IDs are resolved to names from that same cache.
- Seed search uses a Web Worker and can apply a chosen seed by rebuilding the active save and reloading.
- LI can be hidden completely; a low-opacity `LI` launcher remains at the saved HUD position for restoration.
- Manual Export/Import remains available as a fallback.
- Update awareness checks at startup (rate-limited to one hour) and on explicit request.

## Runtime architecture

`legionnaire-insights.user.js` now `@require`s exactly one runtime:

- `runtime/legionnaire-insights-8.0.0.js`

The active install does **not** load `legionnaire-insights-core-7.2.0.js`, any `perf-gate-*`, any `native-ui-7.x`, or `diagnostics-7.10.0.js`. Those files remain in repository history only.

V8 is intentionally event-driven:

- no `setInterval` during gameplay;
- no root `MutationObserver`;
- no React-fiber scanning;
- no localStorage fingerprint loop;
- no periodic three-minute cloud sync.

HUD/club UI refreshes after real user interaction, visibility changes, resize, and a short startup burst. Club DOM passes are cheap and limited to two short post-interaction passes.

POT is computed from the seed and memoized. Career presence is determined by an active save plus a visible OVR tile; the detector does not require the `OVR` label to be a leaf node.

## Important game keys

| Key suffix | Meaning | Merge rule |
| --- | --- | --- |
| `football:save:v2` | Active football career | Same seed: longer `choices`; different seeds keep local |
| `basketball:save:v2` | Active basketball career | Same rule |
| `football:careers:v1` | Completed football careers | Union by `seed` |
| `basketball:careers:v1` | Basketball history | Union by `seed` |
| `collection:v1` | Football collection/stats | Per-device numeric ledger |
| `basketball:collection:v2` | Basketball collection/stats | Per-device numeric ledger |
| `careers-completed:v1` | Combined completed count | Per-device numeric ledger |

`sport:v1` and `currency:v1` are device UI preferences and are excluded.

## Sync v3 compatibility and v8 scheduling

V8 preserves the existing cloud data format and merge invariants:

- one file per browser: `legionnaire-device-<deviceId>.snapshot.json`;
- wrapper schema `3` containing a logical `__legSync: 2` payload;
- gzip/base64 transport when supported;
- SHA-256 payload verification;
- cumulative numbers/maps merge through per-device ledgers;
- completed-career arrays union by seed;
- same-seed active saves advance to the longer `choices` list;
- different active-career seeds never overwrite a local active career automatically;
- legacy v6.15 seven-file import remains as a fallback if no v3 snapshots exist.

Scheduling is deliberately sparse:

1. **Fresh tab/session:** one pull/merge from the cloud, if a token is configured.
2. **Resume after 30+ minutes:** one pull/merge when the tab becomes visible.
3. **Retirement/career completion:** one push of this device's snapshot after the retirement action is confirmed by local career/completion state changing.
4. **Manual Sync:** explicit pull/merge followed by push from Sync/Settings.

There is no background fingerprinting and no automatic sync after ordinary decisions. Retirement push writes only this device's independent snapshot file, so it cannot overwrite another device's file.

## Authentication

The Gist token requires only **Gists: Read and write**. Tokens live in Tampermonkey-private `GM_*Value`, never page `localStorage`. The v8 runtime retains one-time migration from the old page-local token key.

## Validation

GitHub Actions runs:

- JavaScript syntax checks for wrapper/runtime/tests;
- Tampermonkey metadata checks;
- v8 sync compatibility tests covering compression round-trip, checksum rejection, idempotent repeated ledger merge, independent device filenames, career-history union and same-seed advancement;
- architecture guards requiring exactly one runtime and forbidding `setInterval` / `__reactFiber` in the v8 runtime.

## Release flow

1. Modify the v8 runtime and/or wrapper.
2. Increment `@version`.
3. Run syntax and sync-focused tests.
4. Update `CHANGELOG.md`; update this file for architecture/current-behavior changes.
5. Commit deployable files to `main`.
6. Confirm GitHub Actions validation and read back the wrapper header.

## Near-term work

- Real-device validation of 8.0 performance across several full careers on Firefox Android.
- Verify POT detection on career/home/new-career screens and reliable HUD tap/drag behavior.
- Verify retirement-triggered push on both normal and confirmation-dialog retirement flows.
- Verify startup pull and manual Sync between both real devices with existing v7 snapshots.
- Inspect the game's probabilistic decision handler before implementing deterministic outcome selection; never globally patch randomness.