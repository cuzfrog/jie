# Review Tracker — jie-platform

> Working list of open implementation-grade gaps. ADRs in `./addrs/` are the source of truth for consequential decisions. Detail (full edit trail, recommendations, sub-questions) is in `addrs/` and the file's git history.

## Current focus

No open items. jie-platform scope only. Awaiting new gaps.

## Open

(none)

## Past passes

8 passes completed. Latest: **Pass 8 (2026-06-14)** — `JieHandle.waitForIdle` removed (CLI owns the idle gate); body no longer publishes `agent.idle` at startup (reverses ADR 13 §3 J6); new `{team_id}.team.loaded` event published by the handle; Event-Order Contract (body-side alternation + bus-side in-order delivery) recorded normatively. ADR 24. Plus 8 spec-precision fixes. See `addrs/24-event-order-contract.md` and `git log` for the full trail.
