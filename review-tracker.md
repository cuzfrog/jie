# Review Tracker — jie-platform

> Working list of open implementation-grade gaps. ADRs in `./addrs/` are the source of truth for consequential decisions. Detail (full edit trail, recommendations, sub-questions) is in `addrs/` and the file's git history.

## Current focus

Awaiting next review round.

## Open

*(empty)*

## Past passes (compact)

- **Fresh review pass 3 (2026-06-13):** 16 gaps closed in one pass. Headline: multi-team coexistence in v1 (Gap 3 → ADR 21) — team-scoped subject scheme, on-demand loading, swap is a view change. Plus tool error-code pattern (`read_file` / `write_file` / `write_artifact` / `notify` snake_case codes per Gap 13), CLI flag rules (Gaps 7, 12), HTTP/content rules (Gaps 5, 6, 8), EventBus error containment (Gap 4), TEAM.md validation (Gap 9), bash OS-signal handling (Gap 14), platform-topic rejection in `subscribe:` (Gap 15) and `notify` topic validation (Gap 16), artifact key/content caps (Gap 10), `write_file` content cap (Gap 11), Day 2+ `edit_file` tool entry, backlog item #22 for BLOB+compression. ADRs written: 21. Full edit trail and option choices in this file's git history.
