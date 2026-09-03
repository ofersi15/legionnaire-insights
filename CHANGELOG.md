# Changelog

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
