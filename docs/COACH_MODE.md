# Coach mode: evidence and next work

This is the compact handoff for coach work. Update conclusions here; do not carry old chat transcripts into a new session.

## Verified baseline (2026-09-08)

Evidence came from the live game bundle `index-C6NZkW9Y.js`, isolated browser play and the supplied football screenshots. Recheck the bundle URL/hash before assuming the implementation is unchanged.

- Coach careers exist in football and basketball, both as direct starts and as a continuation path after player retirement.
- Active saves still use the sport-specific v2 keys, with the legacy football v1 fallback. Career mode/branch must be part of identity; seed alone is insufficient.
- Ordinary player probability rolls use `seed-step-apply-<optionId>`. Coach decision rolls use `seed-step-mgr-apply-<optionId>`.
- Some coach cards use custom UI/data paths. Salary negotiation and summer choices therefore need narrowly identified handling rather than a generic player-card assumption.
- Live football touchline calls have fixed meter effects in the inspected bundle: best `+14`, reasonable `+5`, risky `-7`.
- Coach screens must never show player POT or player-only Agents/Seed Finder tools. Club OVR remains useful but badges must stay in card flow and must not cover the game's markers.
- Football and basketball club data overlap in names and IDs, so lookups and caches must remain sport-qualified.
- Sync must preserve player/coach and divergent choice branches. An active save may advance only for the same seed/mode and an exact local-choice prefix.

## Shipped in 8.4–8.5

- Coach-aware HUD, details and navigation; player-only information suppressed.
- Coach RNG namespace for standard deterministic previews, with narrow salary/summer fallbacks.
- Read-only touchline guidance and coach club OVR layout/coverage fixes.
- Branch-safe active-save and completed-history merging.
- Standard coach-event forecasts now tolerate the game's compact labels and split gain/cost pills while still verifying the visible option, outcome identity and probability. The manager-routine fallback covers the verified football/basketball `fans`, `agent` and `rest` choices.

The 8.5 verification reused the unchanged live asset `https://www.legionnaire.xyz/assets/index-C6NZkW9Y.js` (recorded SHA-256 `AEBD7D0C8429CD5D2241CD8E805289BEC8DA851C98C2BC014BBC0E907AD8A136`). Fixtures covered the supplied “שגרת מאמן” and “כוכב עם עבר בעייתי” cards without storing a save or invoking a choice.

## Open questions, in priority order

1. Build a compact decision inventory for both sports: decision ID, step derivation, option IDs, probabilities, effects, and whether the card exposes standard React props. Include direct-coach and retired-player-to-coach branches.
2. Verify deterministic previews by replaying fixed seeds across refresh for the remaining coach card types. Fail closed when decision ownership, labels or step cannot be proven.
3. Map transfer-window information: which player/club attributes are visible, which are predetermined, and whether any LI annotation would expose irrelevant player POT.
4. Calculate exact expected values for budget/summer, salary and sponsorship choices from source effects; distinguish deterministic effects from seeded probability.
5. Deep-test basketball parity, including basketball-only decisions, positions, club tables and mobile layouts.
6. Test cross-device Sync with same seed but different mode/branch and with direct vs post-retirement coach histories.
7. Run desktop and Android regression passes for overflow, badge collisions, missing OVR and stale player UI.

## Safety and evidence rules

Predictions are read-only: never call decision handlers, mutate option objects, patch RNG, or write a save. No root React scan, child/sibling traversal, page-wide observer, interval or continuous monitor. Never record tokens, device IDs or full saves. For each new conclusion record only date, asset hash/URL, sport, flow, minimal non-sensitive fixture and result.

Recommended next milestone: a small 8.5.x decision-inventory/preview release, not a broad coach rewrite. Finish one decision family, test both sports where applicable, document the remaining gap, then ship.
