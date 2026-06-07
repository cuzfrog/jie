# Review Tracker — jie-platform Implementer Gaps

> Goal: Identify every gap that would block an implementer from writing working code.
> Status: `open` = unresolved; `resolved` = decided and reflected in specs.

---

## Open Items

### Group J: Implementation-grade gaps (found 2026-06-07)

Found on a fresh implementer pass through `specs/jie-platform/`, `addrs/`, and `handoff.md`. Severity reflects Day-1 implementation risk.

| # | Severity | Files | Issue |
|---|---|---|---|
| J1 | blocker | 05-agent-model.md | `BashResult` → LLM `ToolResult.content` mapping is unspecified. `BashResult` has `stdout`, `stderr`, `exit_code`, `truncated`; the adapter must serialize these into a `text` content block for the LLM. |
| J2 | blocker | 05-agent-model.md | `notify` LLM-visible return string is unspecified. The tool returns `{ ok, recipients }`; the adaptation layer must produce a human-readable string the LLM can react to (including the zero-recipients case). |
| J3 | blocker | 03-event-system.md | `EventBus.publish` error propagation when a subscriber throws is unspecified. In-process synchronous dispatch means a misbehaving callback (e.g. TUI renderer) currently has undefined crash behavior for the publishing agent. |
| J4 | high | 03-event-system.md, 05-agent-model.md | `tool_call_id` uint32 counter mapping from pi-agent's string `toolCallId` is unspecified. The spec says "Jie publishes its own monotonic uint32 counter" but gives no correlation mechanism across `beforeToolCall` → `execute` → `afterToolCall`. |
| J5 | low | 05-agent-model.md | `write_file` `bytes_written` semantic is ambiguous: byte count (Buffer.byteLength) vs character count (content.length). Both are defensible; someone must pick one. |
| J6 | high | 03-event-system.md, ui/tui.md | No initial `agent.idle` on agent start. TUI discovers agents from events; a freshly-idle agent that has not yet received a prompt publishes nothing, so the TUI agents-panel starts empty. |
| J7 | low | ui/tui.md | TUI `startTUI` contract passes `roles: string[]` but the spec is silent on whether this is required or redundant given event-driven agent discovery. |

**Proposed resolutions (awaiting agreement):**
- **D-J1**: `BashResult` → LLM content = `stdout` + `\n--- stderr ---\n` + `stderr`; exit code in `details.exitCode`. → **ADR 13**.
- **D-J2**: `notify` returns LLM-readable string: `"Notification delivered to N recipients"` normally; explicit `"Notification delivered to 0 recipients — no agent is subscribed to '<topic>'"` when zero. → spec note, no ADR.
- **D-J3**: `EventBus.publish` catches per-callback exceptions; continues dispatch to remaining subscribers; `notify` reports the actual (post-error) recipient count. → **ADR 13**.
- **D-J4**: uint32 counter maintained via `Map<pi_toolCallId, uint32>` in AgentBody (non-persistent, in-memory). → spec note, no ADR.
- **D-J5**: `write_file` `bytes_written = Buffer.byteLength(content, "utf8")`. → spec clarification, no ADR.
- **D-J6**: AgentBody publishes `agent.idle` once at startup for each agent, after subscriptions are registered. → **ADR 13**.
- **D-J7**: `roles` param in TUI contract is required; provides blueprint-ordered agent list for initial render before any events arrive. → spec clarification, no ADR.

---

## Resolved History (Groups A–H)

All issues from prior review groups are resolved. Decisions are captured in the ADRs (`./addrs/`), the handoff (`./handoff.md`), and updated specs.

### Group A: Spec Conflicts — RESOLVED (9)

Direct contradictions between files that would crash at implement time. All fixed in the cited specs.

- **A1** `ArtifactStore.list` signature mismatch (TUI vs store) — TUI fixed to `list(prefix)` per store interface.
- **A2** `agent.tool.result.output` type — unified to `string | null` (null on throw).
- **A3** `notify` object-param vs positional-args in examples — added note: examples use shorthand; actual LLM call uses object per TypeBox schema.
- **A4** Compaction `enabled` flag contradiction — table fixed to `enabled: false` for v1.
- **A5** `agent_key` "persistent" vs "new on restart" — v1 has no mid-process agent restart; keys stable across all runs.
- **A6** `session_id` minting contradiction — removed "restart within same process run"; always new session.
- **A7** TUI path `packages/tui/` vs `packages/jie-tui/` — fixed to `packages/jie-tui/`.
- **A8** TUI imports `@jie-platform/core` vs `@cuzfrog/jie-platform` — fixed to `@cuzfrog/jie-platform`.
- **A9** Domain event payload `error` field — error is in `prompt` string, not separate field.

### Group B: Undefined pi-agent Types — RESOLVED (12)

Types from `@earendil-works/pi-agent-core` used throughout the spec but never defined or linked. All documented in `specs/jie-platform/pi-agent-api-reference.md`.

- **B1** `ToolSpec` — string union; parse/validate deferred to implementation.
- **B2–B7** `AgentMessage`, `CompactionSummaryMessage`, `AgentLoopTurnUpdate`, `AgentTool`, `Agent` class, `transformContext`.
- **B8** `convertToLlm`, `prepareNextTurn`.
- **B9** `AgentState` shape.
- **B10** `TSchema` — TypeBox `TSchema` from `@earendil-works/pi-ai`.
- **B11–B12** `steeringMode`, `toolExecution` — `QueueMode` and `ToolExecutionMode`.

### Group C: Tool Implementation Gaps — RESOLVED (5)

- **C1** `WebSearchResult = { title, url, snippet }`.
- **C2** `web_search` backend — pluggable `WebSearchProvider`; DuckDuckGo default.
- **C3** `web_fetch` HTTP policy — http(s), ≤5 redirects, 5 MiB cap, TLS, plain-text conversion, 120s.
- **C4** `write_artifact` / `read_artifact` — full schemas in `05-agent-model.md`.
- **C5** `bash` truncation — 32 KiB per-stream; `BashResult.truncated` flag + marker.

### Group D: Core Mechanics "How?" — RESOLVED (11)

ADR 8 and ADR 9 capture the decisions.

- **D1** Event envelope — only `AgentBody` constructs envelopes.
- **D2** Grace turn — none in v1.
- **D3** `notify` recipient count — `EventBus.subscriberCount`.
- **D4** `AgentMessage` → `TurnRecord` serialization.
- **D5** Compaction range detection — moot for v1 (`enabled: false`).
- **D6/D11** Turn budgets — removed; no budgets in v1 (ADR 6).
- **D7** Tool `signal` combining — `AbortSignal.any([piSignal, AbortSignal.timeout(timeout)])`.
- **D8** Streaming flush timer — `setTimeout` per stream.
- **D9** Self-receipt filtering — in `AgentBody` subscription callback.
- **D10** `ToolResult.terminate` — pi-agent mechanism; Jie tools may set it but loop termination depends on LLM `stopReason`.

### Group E: Startup, Config & Error Handling — RESOLVED (7)

- **E1** Team blueprint fallback — `team_id` omitted → built-in minimal team; set → user team; missing user team → hard fail.
- **E2** `jie -p` with no config — all-defaults run with minimal team.
- **E3** MCP startup — WARN-and-skip at MCP layer; hard-fail at agent-load layer.
- **E4** `jie init` subcommand — none in v1.
- **E5** Config validation — strict; hard fail with clear message and exit 1.
- **E6** Prompt queue cap — deferred to Day 2 (backlog #19). v1 queue is unbounded.
- **E7** Graceful shutdown — 10s bounded; abort via combined `AbortSignal`; force-exit on timeout.

### Group F: Missing Concrete Values — RESOLVED (5)

- **F1** Install version — v1: `git clone` + `bun link --global`; polished install deferred (backlog #20).
- **F2** Git repo URL — `https://cuzfrog.github.com/jie`.
- **F3** `jie --version` source — walk-up algorithm; fallback `0.0.0-dev`.
- **F4** `memory_turns` DDL — full DDL in migration block.
- **F5** `read_file` built-in platform tool (ADR 10); `write_file` elevated to v1 platform tool (H3/ADR 11).

### Group G: Deferred/TBD — RESOLVED (2)

- **G1/G2** TBD pointers to non-existent "Storage Maintenance chapter" — replaced with backlog #7 references. v1 retention: keep everything indefinitely.

### Group H: Implementer-grade gaps — RESOLVED (14 of 14)

- **H1** `prepareNextTurn` spec/code mismatch — row rewritten; `pi-agent-api-reference.md` updated.
- **H2** Minimal team tools → `[bash, read_file, write_file]`.
- **H3** `write_file` is a **v1 platform tool**; platform/team enforcement split — **ADR 11**. ADR 10 amended.
- **H4** `tools/` directory listing fixed; all eight built-ins in `monorepo-structure.md` and `00-overview.md`.
- **H5** `agent.idle` published on **every** `agent_end` — explicit note in `03-event-system.md`.
- **H6** `beforeToolCall` row wording fixed; Jie does not block execution via the hook in v1.
- **H7** Team-blueprint loader is in `jie-platform/team/`. **ADR 12** captures the package boundary. New `jie team install` CLI command. ADR 3 amended.
- **H8** `subscribe:` field is "yes (may be empty `[]`)".
- **H9** `PlatformEventPayload` type-narrowing boundary explicit: domain payload types live in `jie-team`; platform treats all string types as opaque.
- **H10** Business identifiers (`task_id`, `work_id`) are not a platform concept; note added in `05-agent-model.md` `notify` section.
- **H11** 4 KiB truncation applies to **event payload only**; the LLM sees the full value.
- **H12** No platform-reserved key for in-flight tracking; team owns its key scheme.
- **H13** Code-Lens is generic MCP; dev team declares the dependency in its manifest. `code-lens/service.md` and `09-deployment.md` aligned.
- **H14** `agent.queue.update` event (mirroring pi's `queue_update`); TUI subscribes.

---

## Summary

| Group | Theme | Status |
|---|---|---|
| A | Spec conflicts | Resolved (9) |
| B | Undefined pi-agent types | Resolved (12) |
| C | Tool implementation gaps | Resolved (5) |
| D | Core mechanics "how?" | Resolved (11) |
| E | Startup / config / errors | Resolved (7) |
| F | Missing concrete values | Resolved (5) |
| G | Deferred / TBD pointers | Resolved (2) |
| H | Implementer-grade gaps | Resolved (14 of 14) |
| **J** | **New implementation-grade gaps** | **OPEN (7)** |
