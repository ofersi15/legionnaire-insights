# Project context

## Current state

- Userscript: `legionnaire-insights.user.js`
- Current release: `8.4.0`
- Target: `https://www.legionnaire.xyz/*`
- Desktop: Chrome; mobile: Firefox Android; both use Tampermonkey.
- Code delivery: public GitHub raw URL in `@updateURL` and `@downloadURL`.
- Save transport: secret Gist `e1226286d7087eb8faacbf820b8b666f`, owner `ofersi15`.

The game is a React SPA with no account/backend. Saves are event-sourced in origin `localStorage`; a career is recreated from its seed and ordered choice IDs.

## Features

- Player POT is derived from the active seed. Coach careers are detected explicitly and show `LI · מאמן · rating` without player POT; coach details omit player-only fields and tools.
- Active-save lookup checks the sport-specific v2 save first, then the legacy `maslul-kariera:save:v1` fallback used by real football sessions, then the other sport save as a final compatibility fallback.
- Career-screen detection prefers a visible OVR tile and falls back to rendered career text on Firefox/React layouts where the OVR caption is not cleanly discoverable in the DOM. A save alone is never enough to show POT.
- Outside a career screen the HUD shows only `LI`; stale save data must never expose a fake POT.
- Mobile default HUD position is near the lower-left of the player header (`left: 20px`, `top: 62px`); dragging persists a custom position.
- Tapping the HUD opens one mobile-first bottom sheet. The legacy 7.2 overlay/panel is no longer loaded.
- Bottom-sheet sections are mode-aware: player Details/Seed Finder/Agents, coach Details, shared deterministic Preview and Sync/Settings.
- An opt-in seed preview marks predetermined probabilistic outcomes. Player decisions use `seed-step-apply-optionId`; coach decisions use `seed-step-mgr-apply-optionId`. Custom coach salary/summer cards use narrow, game-source-derived fallbacks.
- Live coach-match calls are annotated from the active bundle with their fixed meter effects: best `+14`, reasonable `+5`, risky `-7`.
- Club-choice cards show only `OVR NN`, with the strongest visible offer outlined. Coach badges sit in normal card flow and every rendered offer is covered, including cards initially below the viewport.
- Club data is cached after the first bundle parse and separated by sport, including identical IDs. Full names take precedence over short aliases; agent preferred-club IDs resolve from the active sport's map.
- Club annotation is incremental and normally uses sparse post-interaction retries over 2.4 seconds. Firefox Android can render transfer cards after that window, so the wrapper arms one bounded late refresh after the user becomes idle and one final recovery only if no LI club badge appeared.
- End-of-cycle screens can contain exactly one club offer beside Retirement. Because the runtime only compares 2+ offers, the wrapper has a narrow cached-club fallback that annotates exactly one club with `OVR NN` without applying a “strongest” outline.
- Seed search uses a Web Worker; applying a seed writes the active sport's save (`PG` for basketball, `ST` for football), repairs invalid basketball positions, then reloads.
- LI can be hidden completely; a low-opacity `LI` launcher remains at the saved HUD position for restoration.
- Manual Export/Import remains available as a fallback.
- Update awareness checks at startup (rate-limited to one hour) and on explicit request. When a newer version is detected, the in-app control changes to `עדכן ל-X` and hands the raw `.user.js` URL to Tampermonkey for its normal update/install confirmation screen.

## Runtime architecture

`legionnaire-insights.user.js` `@require`s exactly one runtime:

- `runtime/legionnaire-insights-8.4.0.js`

The active install does **not** load `legionnaire-insights-core-7.2.0.js`, any `perf-gate-*`, any `native-ui-7.x`, or `diagnostics-7.10.0.js`. Those files remain in repository history only.

V8 is intentionally event-driven:

- no `setInterval` during gameplay;
- no root `MutationObserver`;
- no root or full-tree React-fiber scanning in the deployed v8 runtime;
- no localStorage fingerprint loop;
- no periodic three-minute cloud sync.

HUD/toolbar and club UI refresh after real user interaction, visibility changes, a coalesced resize frame, a short startup burst and the bounded late club recovery described above. There is no continuous gameplay watcher. At 900px+ with a fine pointer, the toolbar is inserted immediately before the player card's trophy case; narrower or coarse-pointer layouts retain the draggable floating HUD.

Seed preview starts at visible probabilistic cards, selects the committed host fiber from current DOM props and walks at most eight `return` levels. A current save seed must own the live decision ID and all visible outcomes must match. It never walks child/sibling fibers or the React root. Step comes from the decision ID; narrow custom coach fallbacks infer the next season step only from recognized manager choice IDs. LI reproduces the roll without mutation.

The deployable wrapper contains only small compatibility bridges around the single runtime: Tampermonkey update handoff plus bounded recovery for late/single-club cards. Feature/state/sync logic remains in the runtime.

## Important game keys

| Key suffix | Meaning | Merge rule |
| --- | --- | --- |
| `football:save:v2` | Football player or coach active save | Advance only for same seed/mode and exact choice prefix |
| `save:v1` | Legacy football active-save fallback | Same rule |
| `basketball:save:v2` | Basketball player or coach active save | Same rule |
| `football:careers:v1` | Completed football careers | Preserve seed + player/coach branch |
| `basketball:careers:v1` | Basketball history | Preserve seed + player/coach branch |
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
- completed-career arrays preserve distinct player/coach and choice branches;
- active saves advance only when seed/mode match and local choices are an exact prefix;
- different active-career seeds never overwrite a local active career automatically;
- legacy v6.15 seven-file import remains as a fallback if no v3 snapshots exist.

Scheduling is deliberately sparse:

1. **Fresh tab/session:** one pull/merge from the cloud, if a token is configured.
2. **Resume after 30+ minutes:** one pull/merge when the tab becomes visible.
3. **Retirement/career completion:** one push of this device's snapshot after the retirement action is confirmed by local career/completion state changing.
4. **Manual Sync:** explicit pull/merge followed by push from Sync/Settings.

There is no background fingerprinting and no automatic sync after ordinary decisions. Retirement push writes only this device's independent snapshot file, so it cannot overwrite another device's file.

## Authentication

The Gist token requires **Gists: Read and write** and lives in Tampermonkey-private `GM_*Value`; v8 migrates the old page-local token once.

## Validation

GitHub Actions runs:

- JavaScript syntax checks for wrapper/runtime/tests;
- Tampermonkey metadata checks;
- v8 sync compatibility tests covering compression, checksums, idempotent ledgers, device files and branch-safe career merging;
- active-save fallback tests for the sport-specific and legacy football save keys;
- architecture guards requiring one runtime, no intervals and only the bounded card-local React access used by seed preview.
