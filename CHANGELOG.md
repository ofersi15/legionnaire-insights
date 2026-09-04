# Changelog

## 8.0.0 - 2026-09-04

- Rewrote the deployable userscript runtime from scratch as one `runtime/legionnaire-insights-8.0.0.js`; the active install no longer loads the legacy 7.2 core, performance gate, native-ui patches or diagnostics patch stack.
- Removed all gameplay polling and all React-fiber scanning. The v8 runtime contains no `setInterval`, no `MutationObserver` and no `__reactFiber` access.
- Rebuilt the floating `LI · POT NN` HUD with the preferred mobile default placement, persistent dragging and reliable tap-to-open behavior. Outside an actual career screen it shows only `LI`; stale save data no longer exposes a fake POT.
- Replaced the brittle career detector with a save + visible OVR-tile check that does not require the `OVR` label to be a leaf DOM node.
- Kept club-choice annotations lightweight and event-driven: only `OVR NN` is shown, strongest visible offer is outlined, and cached club data is reused. Two short post-interaction passes replace continuous scanning.
- Replaced the old 7.2 panel with one mobile-first bottom sheet containing Details, Seed Finder, Agents and Sync/Settings. Agent preferred clubs resolve to names rather than raw IDs.
- Preserved the v7 sync snapshot schema (`schema: 3`, `__legSync: 2`), per-device snapshot filenames, gzip/base64 transport, SHA-256 validation, per-device ledgers, career-history union and same-seed active-save advancement.
- Changed sync scheduling fundamentally: one pull at the start of a tab session, an optional pull after returning to a tab only when 30+ minutes have elapsed, a push after a confirmed retirement/career completion, and explicit manual Sync. There is no localStorage fingerprint loop and no three-minute periodic sync during gameplay.
- Retirement sync is push-only to the current device's independent snapshot file, so finishing a career does not require reading every remote snapshot first.
- Kept manual Export/Import and the dormant v6.15 cloud-import fallback for migration safety.
- Added v8 sync compatibility tests for compression round-trip, checksum rejection, idempotent repeated ledger merge, independent device filenames, career-history union and same-seed advancement. CI also enforces the one-runtime/no-polling/no-React-scan architecture.

## 7.10.0 - 2026-09-04

- Added low-overhead in-memory performance diagnostics for real-device Firefox Android testing. The collector records event-loop stalls, legacy core React-render duration, local-state fingerprint duration and club-DOM scan duration; it never records save contents, tokens, Gist payloads or device IDs.
- Added a diagnostics viewer: long-press the normal `LI` / `LI · POT` HUD for about 0.85s on mobile, or press `Alt+D` on desktop. The report can be refreshed, reset or copied for analysis.
- Added a 1Hz event-loop heartbeat to detect main-thread stalls of 80ms or more even where the browser Long Tasks API is unavailable. If Long Tasks is supported, those entries are captured too.
- Reduced the 7.9 post-interaction club-decoration burst from four full DOM passes (`0/70/200/500ms`) to two (`70/500ms`) and time both passes. This targets another obvious source of interaction-time jank while preserving an early badge update plus one recovery pass.
- Kept the 7.9 native UI unchanged otherwise: mobile HUD placement/tapping, stale-POT suppression, cached `OVR NN` badges, Seed Finder and compact-panel dragging remain as shipped in 7.9.
- Kept the v7.2 sync/update merge and transport logic unchanged. The 7.10 performance gate only changes scheduling of the same legacy polling callbacks and adds timing around them.
- GitHub Actions validates the wrapper and all runtime JavaScript files.

## 7.9.0 - 2026-09-04

- Removed continuous native-UI polling; HUD, club badges and compact-panel positioning refresh from interaction/visibility/resize events instead.
- Gated the legacy 3-second full-localStorage change detector so it runs after user activity during idle time, with a two-minute safety check.
- Kept the legacy 700ms React panel render gated behind actual panel visibility.
- Rebuilt HUD tapping with a 12px drag threshold, changed the mobile default position to `left: 20px; top: 62px`, and suppressed POT outside an actual career UI.
- Club annotations show only `OVR NN`; cached club data is reused across transfer screens.

## 7.8.0 - 2026-09-04

- Replaced brittle OVR-tile injection with a draggable floating `LI · POT NN` HUD.
- Added the first pre-core performance gate for the hidden legacy 700ms React-tree render loop.
- Added cached club OVR annotations, strongest-offer outlining, a draggable compact legacy panel and Web Worker Seed Finder.

## 7.7.0 - 2026-09-04

- Short-lived compatibility patch for OVR targeting, faster club badges and compact-panel dragging; superseded by 7.8 after real-device testing.

## 7.6.0 and earlier

Earlier detailed release history remains in Git history. Major retained foundations are the v7 per-device compressed/checksummed Gist sync, automatic update awareness, responsive/hidden panel modes, agent/decision detail tools, club-name resolution and the legacy v6.15 import path.