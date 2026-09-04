# Changelog

## 7.9.0 - 2026-09-04

- Removed all continuous native-UI polling. The HUD, club badges and compact-panel positioning now refresh only on startup, user interaction, visibility changes and resize.
- Extended the pre-core performance gate to the legacy 3-second local-change detector. That detector hashed all Legionnaire localStorage on every tick; it now runs after user activity during idle time, with a two-minute safety check, while the core's periodic/startup/resume sync behavior remains intact.
- Kept the legacy 700ms React-panel render gated behind actual panel visibility and reduced visible-panel refresh pressure further.
- Rebuilt HUD tapping so normal click handling opens the quick menu and drag suppression uses a 12px threshold; small finger movement on Firefox Android no longer turns ordinary taps into failed drags.
- Changed the default mobile HUD position to roughly the lower-left of the player header (`left: 20px`, `top: 62px`), matching the preferred real-device placement. Dragged positions remain remembered.
- Stale save data no longer causes a random POT to appear on the home/new-career screen. POT is displayed only when an actual career UI with a visible `OVR` label is present; outside a career the launcher shows only `LI`.
- Club annotations remain `OVR NN` only (no tier). Cached club data is used immediately; post-interaction annotation uses a short 0/70/200/500ms burst instead of waiting for a polling cycle.
- Kept the native Seed Finder, strongest-offer outline, draggable compact core panel and the v7.2 sync/update implementation.

## 7.8.0 - 2026-09-04

- Removed the brittle OVR-tile integration entirely. POT now lives in a tiny draggable floating `LI · POT NN` HUD, so it is always visible and the quick menu has one reliable click target independent of the game's DOM structure.
- Added a narrow pre-core performance gate for the frozen 7.2 panel render loop. The old core still called `render()` every 700ms and walked the full React tree even while hidden; 7.8 lets that callback run only while the secondary panel is actually visible.
- Replaced the 7.6/7.7 native runtime stack with one 7.8 runtime. Normal gameplay has no native full-React scan, no root MutationObserver and no broad OVR click heuristics.
- Made the HUD draggable on touch/mouse and persist its position. When LI is hidden, a small translucent `LI` restore button remains in the top-left.
- Made the legacy compact panel floating/draggable when it is explicitly opened and persist its position.
- Club annotations now show only `OVR NN`; tier labels were removed. Club data is cached in localStorage after the first live-bundle parse, and short refresh bursts after clicks/save changes make later transfer screens annotate much faster without continuous DOM polling.
- Kept strongest-offer outlining and native Seed Finder. Seed search remains isolated in a Web Worker.
- Kept the v7.2 sync/update implementation unchanged; only its hidden-panel UI polling is gated externally.

## 7.7.0 - 2026-09-04

- Added a small compatibility patch attempting to improve OVR targeting, strip tier text from visible club badges, accelerate post-click refreshes and make compact mode draggable.
- Superseded by 7.8 after real-device testing showed the OVR-target approach was still unreliable and the frozen core's hidden 700ms React scan remained a major source of intermittent jank.

## 7.6.0 - 2026-09-03

- Removed the broad root `MutationObserver` from the native UI. Presentation now refreshes primarily when the active save changes, with a 12-second recovery refresh and visibility refresh; this avoids rescanning the whole visible DOM after every React subtree mutation on Firefox Android.
- Reworked the OVR integration so the LI menu is bound directly to the exact compact OVR tile. The old delegated ancestor heuristic could treat a much larger player/decision container as an OVR target, which is why tapping the lower-right decision/club could open LI.
- Replaced the POT pseudo-element with a real absolutely positioned `POT NN` child inside the OVR tile. Potential is derived from the career seed and stays fixed for the career.
- Replaced clipped club pseudo-badges with short absolute DOM badges (`T1 · 84` style), keeping them out of layout while avoiding mobile ellipsis/cutoff.
- Kept strongest-club outlining, native Seed Finder, full hide/restore, the frozen v7.2 sync/update core and the Web Worker seed search.
- `native-ui-7.5.0.js` is no longer required by the deployable userscript; 7.6 loads only the frozen 7.2 core plus `native-ui-7.6.0.js`.

## 7.5.0 - 2026-09-03

- Replaced the stacked 7.3 + 7.4 native UI runtimes with one low-overhead 7.5 runtime. The previous combination continuously walked the full React fiber tree from two separate timers and repeatedly scanned/mutated the DOM, which could make Firefox Android noticeably slow.
- Removed all always-on full React-tree polling from the native UI. POT/development are derived from the active save seed, current OVR is read from the visible OVR tile, and club annotations are discovered from visible clickable club names. The frozen 7.2 core still reads live React state only when its on-demand panel is opened.
- Stopped injecting probability/outcome pills into generic decision buttons. Those extra children changed the buttons' intrinsic width/height and caused the clipped/overflowing decision cards seen on mobile.
- Changed transfer club metadata to absolute `::after` badges driven by data attributes, so T/OVR/strongest markers no longer add any height or width to the game's choice cards. This keeps the national-team row and lower transfer CTA from being pushed by LI content.
- Moved the persistent POT display into the existing OVR tile as a tiny absolute label. Tapping the OVR still opens the LI quick menu; when LI is fully hidden, the same OVR area restores it. Alt+L remains a desktop fallback.
- Kept the native Seed Finder, but moved the expensive seed search to a Web Worker when supported. The fallback uses small idle-time batches instead of long main-thread bursts, so searching should not freeze gameplay.
- Preserved the v7.2 sync/update runtime unchanged. The deployable userscript now requires only `legionnaire-insights-core-7.2.0.js` and `native-ui-7.5.0.js`; old 7.3/7.4 UI files remain in Git history/repository but are no longer executed.
- Passed `node --check` locally for the new 7.5 runtime. GitHub Actions validates the wrapper and every runtime JavaScript file.

## 7.4.0 - 2026-09-03

- Removed the tall 7.3 Potential/Tools row from the transfer-window layout and replaced it with a compact absolute LI/POT chip in the transfer header, so Legionnaire Insights no longer adds vertical height that can cover the national-team row or push the lower transfer CTA below the mobile viewport.
- Added a compact LI quick menu with direct access to Details, native Seed Finder, Tools/Sync and a full Hide LI action.
- Added a native mobile-friendly Seed Finder with remembered Potential/starting-OVR/development targets, cooperative search/cancel, inline results and one-tap apply-and-reload.
- Added a `מצא סיד לקריירה חדשה` entry beside the game's new-career control when that screen is visible.
- Added full native-UI hiding: club annotations, strongest-club outline, LI chip, seed entry and the legacy launcher disappear. Tapping the player's top OVR restores LI; Alt+L and an invisible long-press gesture in the page's top-left corner are fallbacks.
- Kept the v7.2 sync/update core unchanged and left v7.3 responsible for the proven club-card annotations; v7.4 is a presentation/workflow patch layered after it.
- Passed JavaScript syntax checks for the 7.4 runtime and deployable userscript; validation workflow now checks every runtime JavaScript file as well as the wrapper metadata.

## 7.3.0 - 2026-09-03

- Moved live player insights into the game's own decision layout instead of keeping the overlay open over gameplay.
- Added an in-flow Potential/growth/development strip with on-demand Details and Tools controls.
- Annotated visible club choices with tier and overall from the live game bundle, and highlights the highest-OVR offer without replacing the game's click targets.
- Added compact probability annotations when a decision option exposes multiple outcomes.
- Migrated the legacy overlay to hidden once on upgrade; the LI launcher remains available on screens without a live decision.
- Kept Agents, Seed Finder, update controls and sync in the existing panel, with Rafi Ben-Ami's club IDs still resolved to names from live club data.
- Split runtime delivery so the 7.2 sync/update core is frozen unchanged and the 7.3 native UI is isolated in a versioned addon.
- Passed JavaScript syntax checks for the deployable wrapper and native UI addon. Live DOM/device validation is still required on the real game because CI cannot reproduce its browser state.

## 7.2.0 - 2026-09-03

- Added an independent version check on startup, tab resume and every manual cloud sync.
- Added a manual Check now control and an Install update link in the Tools tab.
- Added a yellow version badge in the panel header whenever a newer release is available.
- Limited background checks to once per hour while keeping forced manual/sync checks immediate.
- Kept code-update checks separate from saved-game synchronization; installation remains user-confirmed by Tampermonkey.

## 7.1.0 - 2026-09-03

- Rebuilt the overlay as a responsive three-state interface: compact HUD, tabbed panel and hidden launcher.
- Added separate Now, Tools and Agents tabs so static agent information no longer occupies the live decision view.
- Turned the expanded mobile panel into a height-limited bottom sheet and made compact mode the mobile default.
- Improved typography, spacing, touch targets, contrast and viewport-height handling for smaller desktop and mobile screens.
- Replaced Rafi Ben-Ami's raw preferred-club IDs with names and club details from the live game bundle.
- Made club-data loading retry when the game bundle is not yet present and removed raw-ID fallback from the UI.
- Preserved the v7 sync/update flow unchanged; passed JavaScript syntax and metadata checks.

## 7.0.1 - 2026-09-03

- Moved userscript delivery to the public `ofersi15/legionnaire-insights` repository.
- Added automatic sync on startup, resume, local changes and periodic checks.
- Replaced shared seven-file writes with one compressed snapshot per device.
- Added SHA-256 payload verification and upload verification.
- Avoided cross-device write collisions because each device owns its file.
- Advanced same-seed active careers to the longer choice history; preserved different-seed careers locally.
- Migrated the GitHub token from page `localStorage` to Tampermonkey-private storage.
- Retained one-time import compatibility with the v6.15 chunk format.
- Removed the obsolete in-script Gist publisher and moved long historical comments out of runtime source.
- Added dependency-free GitHub Actions validation for JavaScript syntax and Tampermonkey metadata.

## 6.15 — legacy baseline

- CRDT-style counter/map ledgers and career-history union.
- Seven-file Gist transport with retries, created to avoid a mobile request-size truncation.
- Manual export/import and script-to-Gist publisher.

Detailed v6 iteration history remains in Git history and the original project document; it is intentionally omitted here to keep routine agent context small.
