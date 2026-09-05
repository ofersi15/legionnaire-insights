# Agent instructions

These instructions apply to the entire repository.

## Read order

1. Read this file.
2. Read `docs/PROJECT.md` for current architecture and invariants.
3. Read only the relevant part of `legionnaire-insights.user.js`.
4. Read `CHANGELOG.md` only when release history matters.

Do not reconstruct context from old chats or copy long historical narratives into source comments. Repository files are the source of truth.

## Release rules

- The deployable file is `legionnaire-insights.user.js` on `main`.
- Increment `@version` for every shipped code change.
- Keep `@name` and `@namespace` unchanged so Tampermonkey updates the existing install.
- Keep `@updateURL` and `@downloadURL` on the repository raw URL.
- Never commit GitHub tokens, Gist payloads, device IDs or exported save data.
- Update `CHANGELOG.md` for every release. Update `docs/PROJECT.md` only when current behavior or architecture changes.

## Sync invariants

- Each device writes only its own `legionnaire-device-<id>.snapshot.json` Gist file.
- Snapshot payloads are gzip/base64 with SHA-256 verification.
- Counter/map ledgers merge by per-device maximum; histories union by seed.
- For the same active-career seed, the longer choices list wins. Different seeds must never overwrite one another automatically.
- Preserve v6.15 chunk import until both real devices have successfully migrated to v7.
- Tokens belong in `GM_*Value`, never page `localStorage`.

## Validation

At minimum run:

```bash
node --check legionnaire-insights.user.js
```

The same syntax and metadata checks run automatically in GitHub Actions.

The deployed runtime must not scan from the React root or traverse child/sibling fibers. Seed preview may only start at a visible probabilistic option card, use the DOM's current React props to select its committed host fiber, and walk a small, hard-bounded `return` chain. Accept props only after a current save seed owns the live decision ID and the visible option/outcome labels match. Parse the season step from that decision ID; `choices.length` can include extra agent/sponsor choices.

Club cache entries must stay sport-tagged and club maps must contain only the active sport. Index exact full names before short aliases so aliases cannot overwrite another club's exact name.

For sync changes also test compression round-trip, checksum rejection, idempotent repeated merge, two independent device files and same-seed advancement. Record only the result in the changelog; do not commit large fixtures.

## Documentation budget

Keep this file below roughly 600 words and `docs/PROJECT.md` below roughly 1,200 words. Prefer current facts, tables and invariants. Move obsolete details to Git history rather than growing permanent context.
