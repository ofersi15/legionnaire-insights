# Changelog

## 7.0.1 — 2026-09-03

- Moved userscript delivery to the public `ofersi15/legionnaire-insights` repository.
- Added automatic sync on startup, resume, local changes and periodic checks.
- Replaced shared seven-file writes with one compressed snapshot per device.
- Added SHA-256 payload verification and upload verification.
- Avoided cross-device write collisions because each device owns its file.
- Advanced same-seed active careers to the longer choice history; preserved different-seed careers locally.
- Migrated the GitHub token from page `localStorage` to Tampermonkey-private storage.
- Retained one-time import compatibility with the v6.15 chunk format.
- Removed the obsolete in-script Gist publisher and moved long historical comments out of runtime source.

## 6.15 — legacy baseline

- CRDT-style counter/map ledgers and career-history union.
- Seven-file Gist transport with retries, created to avoid a mobile request-size truncation.
- Manual export/import and script-to-Gist publisher.

Detailed v6 iteration history remains in Git history and the original project document; it is intentionally omitted here to keep routine agent context small.
