# Review Tracker — jie-platform

> Working list of open implementation-grade gaps. ADRs in `./addrs/` are the source of truth for consequential decisions. Detail (full edit trail, recommendations, sub-questions) is in `addrs/` and the file's git history.

## Current focus

No open items. jie-platform scope only. Awaiting new gaps.

## Open

(none)

## Past passes (compact)

- **Pass 7 (2026-06-14):** 5 spec-precision fixes — Memory Persistence wording, Streaming Tunables rename, Troubleshooting error msg, Startup Sequence ordering, TUI `/team` error handling. No new ADRs.
- **Pass 6 (2026-06-14):** 3 streaming/event-payload fixes — `web_fetch` uses Bun's default redirects, `block_type: "text" | "thinking"` in stream chunks, `agent.turn.start` consumer clarified. No new ADRs.
- **Pass 5 (2026-06-14):** 5 gaps — `onUpdate` plumbing, `JieHandle.swapTeam` removed, "work unit created" log dropped, `transformContext` wrapper no-op, `web_search` failure handling. ADR 15 amended.
- **Pass 4 (2026-06-13):** 5 gaps — `MemoryManager` session queries, `agent.continue()` conditional, env-var API key removed, `-p` uses `waitForIdle`, `onIdle` retained. ADRs 22, 23.
- **Pass 3 (2026-06-13):** 16 gaps — headline: multi-team coexistence in v1 (ADR 21). Plus tool error codes, CLI flag rules, HTTP/content rules, EventBus error containment, TEAM.md validation, bash OS-signal handling, platform-topic rejection, `notify` topic validation, artifact caps, `write_file` cap, Day 2+ `edit_file`, backlog #22.
