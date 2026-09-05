# Changelog

## 8.2.3 - 2026-09-05

- Fixed seed previews disappearing in real careers after auxiliary agent or sponsor choices. Saved `choices.length` is a replay cursor, not the game's season step; the preview now parses the actual step from the live decision ID.
- When both a stale sport-specific save and the live legacy football save exist, the preview now tests each current save seed and selects the one that owns the rendered decision.
- Uses React's current DOM props to identify the committed host fiber before the same bounded eight-level parent walk. This keeps stale alternates from winning without scanning the React tree.
- Added regression coverage where nine saved choices correspond to decision step four, the preferred save is stale, and the current component lives on the host alternate.
- Audited the full live club database: 15 IDs and 40 exact names are shared across sports. The 8.2.2 sport separation covers all of them, including football/basketball Barcelona (89/87) and Bayern Munich (90/86).

## 8.2.2 - 2026-09-04

- Fixed cross-sport club ratings overwriting one another in the local club cache. The live bundle gives football Olympiacos OVR 84 and basketball Olympiacos OVR 90 under the same internal ID; the UI could therefore show 90 on a football offer.
- Tagged every parsed club with its sport, retained duplicate IDs under sport-qualified cache keys, and rebuilt name/ID maps only from the active sport. The wrapper's single-club fallback now uses the same sport-aware v4 cache.
- Indexed exact full club names before short aliases. This prevents the football short name for Olympiakos Nicosia (OVR 70) from taking the exact Greek Olympiacos name (OVR 84).
- Added regressions for football/basketball Olympiacos, the Nicosia alias collision, source-table sport detection and sport-qualified duplicate IDs.

## 8.2.1 - 2026-09-04

- Fixed seed previews reading stale React props after a decision-card commit. React can retain the previous render on the DOM-linked fiber and place the current render on its `alternate`, which could produce a valid calculation for the wrong option.
- The bounded lookup now checks both fiber versions at each of the same eight parent levels and accepts one only when its decision ID matches the active seed/step and its option label, outcome count and every outcome label exactly match the rendered card. Ambiguous or unavailable props fail closed with no marker.
- Added a regression fixture where the DOM-linked fiber deliberately contains a previous decision and the alternate contains the visible one; first/middle/last deterministic outcome tests remain unchanged.

## 8.2.0 - 2026-09-04

- Added an opt-in, read-only seed outcome preview. `כלים / Sync` now includes `תחזית: כבויה/פעילה`; when enabled, the outcome that the current seed will roll is outlined and marked `🔮 נקבע` (`🔮` on narrow mobile).
- The preview reproduces the game's active deterministic path exactly: the active save's `choices.length` replay cursor, FNV seed hash, the `seed-step-apply-optionId` RNG key, one Mulberry-style draw and cumulative probability bands. It supports any outcome count, including the live three-outcome 60/20/20 football event.
- Kept gameplay unchanged: no probabilities, option objects, callbacks, save data or RNG state are modified. The feature defaults off and only reads data while an actual probabilistic personal-decision card is visible.
- Added a narrowly bounded React lookup starting from each visible personal option and walking at most eight parent fibers. There is no root/full-tree scan, child/sibling traversal, observer, interval or background loop; CI now permits only this localized access pattern.
- Added deterministic fixtures for first/middle/last selection in a three-outcome option, immutability, opt-in behavior and architecture guards.

## 8.1.0 - 2026-09-04

- Added a responsive desktop toolbar inside the player card, immediately above the trophy case: `POT NN · gap`, Details, Seed Finder and Tools / Sync. It is 30px tall, does not float over the decision area and is not draggable.
- Kept the existing tiny draggable `LI · POT NN` HUD on mobile and coarse-pointer layouts. The layout switches at the tested 900px/fine-pointer boundary and coalesces resize work through one animation frame.
- Validated the active game bundle and live careers before attempting deterministic outcomes. The current `onChoose` accepts only an option ID, finds the original option in pending state, and rolls through the seeded game RNG. Saves persist only choice IDs, so Candidate A/B object clones cannot reach the current handler and a transient outcome override would not survive replay after refresh.
- Kept deterministic-outcome forcing out of the deployed runtime. There is still no global RNG patch, interval, root observer or React-tree scan.
- Browser validation covered 1920×1080, 1440×900, 1024×768, 450×875 and 412×915 with no horizontal overflow; toolbar actions and the mobile HUD were exercised in a runtime harness.

## 8.0.4 - 2026-09-04

- Fixed the end-of-cycle screen where a single club offer appears beside Retirement. The v8 runtime intentionally only compares/annotates 2+ club cards, so the wrapper now adds `OVR NN` to exactly one cached club match without applying a misleading “strongest” outline.
- The single-club fallback uses the existing v3 club cache and runtime badge attributes/styles; it runs only in the bounded late-recovery path and once after startup, with no interval, observer, React scan or continuous polling.
- Began targeted reverse-engineering of probabilistic decisions for deterministic outcome selection. Legacy live decision props expose `decision.options[].outcomes` (`probability`, `resultLabel`, `effects`) and a live `onChoose` handler; implementation work will avoid global `Math.random` patching and keep normal random behavior as the default.

## 8.0.3 - 2026-09-04

- Added a bounded late club-card refresh for Firefox Android cases where React finishes rendering transfer options after the runtime's normal 2.4-second post-interaction burst. The bridge waits for user idle, triggers one extra runtime refresh burst, and performs one final recovery burst only if no LI club badge appeared.
- Kept the no-polling performance model: there is still no interval, MutationObserver, React scan or continuous DOM loop. The late refresh is timeout-bounded and only armed after a real user interaction or initial page load.
- Kept the 8.0.2 in-app update handoff so a detected newer version becomes an `עדכן ל-X` action that opens Tampermonkey's userscript install/update flow.

## 8.0.2 - 2026-09-04

- Turned the existing update checker into an update handoff: when a newer version is detected, the same control changes to `עדכן ל-X` and opens the raw `.user.js` URL so Tampermonkey can present its normal update/install confirmation screen.
- This is intentionally a Tampermonkey handoff rather than a self-modifying updater; the userscript never rewrites its own installed source directly.

## 8.0.1 - 2026-09-04

- Fixed active-career detection on real Firefox Android sessions. V8 now checks the sport-specific save plus the legacy `maslul-kariera:save:v1` fallback instead of assuming the active football save always lives in `football:save:v2`.
- Hardened the career-screen detector with a rendered-text fallback for React/Firefox layouts where the visible OVR caption is not discoverable as a clean standalone DOM node. POT still requires both a real save and visible career UI, so stale saves on the home screen do not expose a fake POT.
- Added non-sensitive debug state showing which save key was detected, whether career UI was detected, the OVR source and club-cache size.
- Reworked club annotations to be incremental instead of removing/recreating every badge on each pass, reducing flicker when React rerenders decision cards.
- Added club short-name aliases from the live bundle and bumped the club cache format so transfer cards can match either full or short displayed names.
- Replaced the too-short 80/350ms club refresh pair with sparse adaptive retries across 2.4 seconds. Real-device diagnostics showed a club DOM pass costs about 1–2ms, so these retries improve reliability without bringing back polling or measurable jank.
- Seed application and retirement detection now use the actually detected active-save key, including the legacy football save key when present.
- Kept the single-runtime v8 architecture, sparse sync schedule, v7-compatible snapshot format and no-`setInterval` / no-React-scan guarantees.

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
- Rebuilt HUD tapping with a 12px drag threshold, changed the mobile default position to `left: 20px`, `top: 62px`, and suppressed POT outside an actual career UI.
- Club annotations show only `OVR NN`; cached club data is reused across transfer screens.

## 7.8.0 - 2026-09-04

- Replaced brittle OVR-tile injection with a draggable floating `LI · POT NN` HUD.
- Added the first pre-core performance gate for the hidden legacy 700ms React-tree render loop.
- Added cached club OVR annotations, strongest-offer outlining, a draggable compact legacy panel and Web Worker Seed Finder.

## 7.7.0 - 2026-09-04

- Short-lived compatibility patch for OVR targeting, faster club badges and compact-panel dragging; superseded by 7.8 after real-device testing.

## 7.6.0 and earlier

Earlier detailed release history remains in Git history. Major retained foundations are the v7 per-device compressed/checksummed Gist sync, automatic update awareness, responsive/hidden panel modes, agent/decision detail tools, club-name resolution and the legacy v6.15 import path.
