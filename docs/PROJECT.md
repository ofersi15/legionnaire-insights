# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `8.1.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Fixed career POT is derived from the active seed. Mobile/coarse-pointer layouts use the tiny draggable `LI · POT NN` HUD; desktop uses a 30px toolbar inside the player card with POT/gap, Details, Seed Finder and Tools / Sync.
- Active-save lookup checks the sport-specific v2 save first, then the legacy `maslul-kariera:save:v1` fallback used by real football sessions, then the other sport save as a final compatibility fallback.
- Career-screen detection prefers a visible OVR tile and falls back to rendered career text on Firefox/React layouts where the OVR caption is not cleanly discoverable in the DOM. A save alone is never enough to show POT.
- Outside a career screen the HUD shows only `LI`; stale save data must never expose a fake POT.
- Mobile default HUD position is near the lower-left of the player header (`left: 20px`, `top: 62px`); dragging persists a custom position.
- Tapping the HUD opens one mobile-first bottom sheet. The legacy 7.2 overlay/panel is no longer loaded.
- Bottom-sheet sections: player Details, native Seed Finder, Agents, and Sync/Settings.
- Club-choice cards show only `OVR NN`, with the strongest visible offer outlined. Tier text is intentionally omitted.
- Club data is cached locally after the first live-bundle parse. Full and short club names are indexed so cards can match either form; agent preferred-club IDs resolve to names from the same cache.
- Club annotation is incremental and normally uses sparse post-interaction retries over 2.4 seconds. Firefox Android can render transfer cards after that window, so the wrapper arms one bounded late refresh after the user becomes idle and one final recovery only if no LI club badge appeared. There is no continuous observer or interval.
- End-of-cycle screens can contain exactly one club offer beside Retirement. Because the runtime only compares 2+ offers, the wrapper has a narrow cached-club fallback that annotates exactly one club with `OVR NN` without applying a “strongest” outline.
- Seed search uses a Web Worker and can apply a chosen seed by rebuilding the actually detected active-save key and reloading.
- LI can be hidden completely; a low-opacity `LI` launcher remains at the saved HUD position for restoration.
- Manual Export/Import remains available as a fallback.
- Update awareness checks at startup (rate-limited to one hour) and on explicit request. When a newer version is detected, the in-app control changes to `עדכן ל-X` and hands the raw `.user.js` URL to Tampermonkey for its normal update/install confirmation screen.

## Runtime architecture

`legionnaire-insights.user.js` `@require`s exactly one runtime:

- `runtime/legionnaire-insights-8.1.0.js`

The active install does **not** load `legionnaire-insights-core-7.2.0.js`, any `perf-gate-*`, any `native-ui-7.x`, or `diagnostics-7.10.0.js`. Those files remain in repository history only.

V8 is intentionally event-driven:

- no `setInterval` during gameplay;
- no root `MutationObserver`;
- no React-fiber scanning in the deployed v8 runtime;
- no localStorage fingerprint loop;
- no periodic three-minute cloud sync.

HUD/toolbar and club UI refresh after real user interaction, visibility changes, a coalesced resize frame, a short startup burst and the bounded late club recovery described above. There is no continuous gameplay watcher. At 900px+ with a fine pointer, the toolbar is inserted immediately before the player card's trophy case; narrower or coarse-pointer layouts retain the draggable floating HUD.

The deployable wrapper contains only small compatibility bridges around the single runtime: Tampermonkey update handoff plus bounded recovery for late/single-club cards. Feature/state/sync logic remains in the runtime.

## Important game keys

| Key suffix | Meaning | Merge rule |
| --- | --- | --- |
| `football:save:v2` | Football active-save key on newer layouts | Same seed: longer `choices`; different seeds keep local |
| `save:v1` | Legacy/current football active-save fallback seen on real devices | Same rule |
| `basketball:save:v2` | Basketball active career | Same rule |
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
- active-save fallback tests for the sport-specific and legacy football save keys;
- architecture guards requiring exactly one runtime and forbidding `setInterval` / `__reactFiber` in the deployed v8 runtime.

## Probabilistic-decision research

The active bundle renders personal cards with `onClick: () => onChoose(option.id)`. The one-argument callback finds the original pending option, derives an RNG from `seed + step + optionId`, and samples its outcomes cumulatively. Saves record only ordered choice IDs and replay outcomes from the seed.

The research branch's option-clone Candidates A/B therefore cannot reach the handler. A transient mutation would not survive refresh. Forcing remains research-only until it has a replay-safe representation without a global RNG patch, continuous React scan or save corruption.

## Near-term work

- Validate the 8.0.4 one-club OVR fallback on the end-of-cycle screen.
- Verify retirement-triggered push on both normal and confirmation-dialog retirement flows.
- Verify startup pull and manual Sync between both real devices with existing v7 snapshots.
- Find a replay-safe representation for forced outcomes, then validate it in live careers before integrating any production control.
