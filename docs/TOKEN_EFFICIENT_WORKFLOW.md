# Token-efficient session workflow

The goal is for every new session to load only current facts and one bounded task.

## Start a new Codex session

1. Open a new task in the saved `legionnaire-insights` project/repository. A new task prevents the large previous conversation and screenshots from being resent as context.
2. Use low or medium reasoning for routine documentation, layout and known regressions. Reserve high reasoning for one bounded reverse-engineering question such as exact RNG/step derivation.
3. Attach only a new screenshot or save excerpt that is essential to the current bug. Never attach tokens, device IDs or a full save.
4. Paste the prompt below and replace the milestone line. Do not repeat the full project history.

```text
Continue Legionnaire Insights from main. First read AGENTS.md and docs/PROJECT.md; for coach work also read docs/COACH_MODE.md. Treat those files as the handoff and do not reconstruct old chats.

Milestone for this session: <one concrete outcome, for example: map and implement deterministic previews for coach salary decisions in football>.

Use rg and targeted code slices; do not dump whole runtimes, minified bundles, saves, or the long changelog. Reuse the recorded live-asset evidence if its URL/hash is unchanged. Play only the smallest unresolved flow. Keep updates concise, run targeted tests plus one full pre-release pass, update the current-state docs, bump the version/changelog when code ships, and push to main. Preserve all performance, read-only prediction, privacy and branch-safe Sync invariants.
```

## During the session

- Keep a single question as the acceptance criterion. Defer unrelated findings to the ordered backlog in `docs/COACH_MODE.md`.
- Locate before reading: search symbol, decision ID, storage key or visible Hebrew label, then inspect the smallest surrounding region.
- For a new game bundle, use a local extraction script that emits a small structured inventory. Do not paste or repeatedly reread the minified source.
- Reuse isolated football and basketball careers. Make one controlled choice/reload comparison rather than playing a full season without a hypothesis.
- Prefer deterministic fixtures derived from verified source behavior over repeated UI play. Browser testing should confirm integration and layout.
- Run only affected tests while editing. Run syntax, metadata and the complete existing suite once after the final change.

## End the session

Before switching topics, leave the repository self-contained:

- current behavior in `docs/PROJECT.md` only if architecture changed;
- coach evidence and next unanswered item in `docs/COACH_MODE.md`;
- one concise changelog entry for a shipped version;
- no raw bundle copies, browser dumps, screenshots, secrets or full saves committed;
- clean test result and pushed `main` commit SHA in the final response.

If the milestone grows into multiple independent investigations, stop after the first releasable slice and open another new task with the same short prompt. This usually saves more context than carrying a long exploratory conversation forward.
