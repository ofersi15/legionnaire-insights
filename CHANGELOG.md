# Changelog

## 7.4.0 - 2026-09-03

- Removed the tall 7.3 Potential/Tools row from the transfer-window layout and replaced it with a compact absolute LI/POT chip in the transfer header, so Legionnaire Insights no longer adds vertical height that can cover the national-team row or push the lower transfer CTA below the mobile viewport.
- Added a compact LI quick menu with direct access to Details, native Seed Finder, Tools/Sync and a full Hide LI action.
- Added a native mobile-friendly Seed Finder with remembered Potential/starting-OVR/development targets, cooperative search/cancel, inline results and one-tap apply-and-reload.
- Added a `מצא סיד לקריירה חדשה` entry beside the game's new-career control when that screen is visible.
- Added full native-UI hiding: club annotations, strongest-club outline, LI chip, seed entry and the legacy launcher disappear. Tapping the player's top OVR restores LI; Alt+L and an invisible long-press gesture in the page's top-left corner are fallbacks.
- Kept the v7.2 sync/update core unchanged and left v7.3 responsible for the proven club-card annotations; v7.4 is a presentation/workflow patch layered after it.
- Passed `node --check` locally for the 7.4 runtime and deployable userscript; validation workflow now checks every runtime JavaScript file as well as the wrapper metadata.

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