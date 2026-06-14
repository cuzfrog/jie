# Review Tracker — jie-platform

> Working list of open implementation-grade gaps. ADRs in `./addrs/` are the source of truth for consequential decisions. Detail (full edit trail, recommendations, sub-questions) is in `addrs/` and the file's git history.

## Current focus

Pass 10 (2026-06-14) complete. 12 items closed across 3 batches + 4 doc-dedup consolidations. No open items.

## Open

(none)

## Past passes

10 passes completed. Latest: **Pass 10 (2026-06-14)** — 12 spec-precision fixes + 4 consolidation passes across 9 files.

- **Batch 1 — type/charset + consolidation.** A1 added `'user.prompt'` to `PlatformEventType` and `PlatformEventPayload` (catch-all was wrong for it). B1 + B2 enforced `team_id` and role-stem charsets in the team-blueprint loader with hard-fail errors; ADR 25 records the decision. D1 clarified `AgentSoul.subscriptions` is the team-scoped subject list. D3 added `web_search` `max_results: < 1` clamping rule. Four consolidation passes trimmed the Event-Order Contract, wire-format envelope, team-scoping rule, and Streaming flush rules (restated 4–5 times each) to one canonical location + cross-references. Fixed a stale `ui/tui.md` reference (pre-ADR 24 "per-body startup publish" wording) and removed a duplicate "Unknown frontmatter fields…" paragraph in `06-agent-model.md`.
- **Batch 2 — scope clarity.** C1 stripped the dead `jie-team` reference from `edit_file` Day 2+ section. C2 tagged all `00-user-scenarios.md` scenarios with `[v1]` or `[Day 2+]` based on dependencies (TUI/MCP per ADR 17). D2 removed the stale `M8` cross-reference.
- **Batch 3 — MCP/LLM env-var separation.** D4 clarified that `McpServerConfig.auth.token_env` is for the MCP server's auth, not the LLM provider's API key (which per ADR 23 has no env fallback).

Net effect: type system is now correct; identifier charsets are enforced; doc duplication is reduced by ~30 lines of restated prose; acceptance-test surface (`v1` scenarios) is explicit. ADR 25 captures the charset decision; see `git log` for the full trail.

Pass 9 — `JieHandle.waitForIdle` removed (CLI owns the idle gate); body no longer publishes `agent.idle` at startup (reverses ADR 13 §3 J6); new `{team_id}.team.loaded` event published by the handle; Event-Order Contract (body-side alternation + bus-side in-order delivery) recorded normatively. ADR 24.

