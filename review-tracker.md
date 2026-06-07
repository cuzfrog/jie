# Review Tracker — jie-platform Implementer Gaps

> Goal: Identify every gap that would block an implementer from writing working code.
> Status: `open` = unresolved; `resolved` = decided and reflected in specs.

---

## Open Items — Group H: Implementer-grade gaps

Found on a fresh implementer pass through `specs/jie-platform/`, `addrs/`, and `handoff.md`. Severity tiers reflect Day-1 implementation risk, not long-term importance. H4 was a downstream consequence of H2/H3 and is also resolved.

**All 14 items resolved.** See "Resolved in H" below for the per-item summary.

| # | Severity | Files | Issue |
|---|---|---|---|
| (none) | | | All Group H items are resolved. |

**Group H complete.** The implementer-grade pass is closed. See "Resolved in H" below for the full per-item summary.

**Group H is closed.** All 14 items resolved. Next: implementation pass can begin, or a new review pass for any newly-discovered gaps.

---

## Resolved History (Groups A–G)

All issues from prior review groups are resolved. Decisions are captured in the ADRs (`./addrs/`), the handoff (`./handoff.md`), and updated specs. Compact one-line index below.

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

Types from `@earendil-works/pi-agent-core` used throughout the spec but never defined or linked. All documented in the new `specs/jie-platform/pi-agent-api-reference.md`.

- **B1** `ToolSpec` — string union; parse/validate deferred to implementation.
- **B2–B7** `AgentMessage`, `CompactionSummaryMessage`, `AgentLoopTurnUpdate`, `AgentTool`, `Agent` class, `transformContext` — documented in `pi-agent-api-reference.md`.
- **B8** `convertToLlm`, `prepareNextTurn` — documented.
- **B9** `AgentState` shape (systemPrompt, model, tools, messages, runtime flags) — documented.
- **B10** `TSchema` — TypeBox `TSchema` from `@earendil-works/pi-ai`.
- **B11–B12** `steeringMode: "all"`, `toolExecution: "sequential"` — `QueueMode` and `ToolExecutionMode` documented.

### Group C: Tool Implementation Gaps — RESOLVED (5)

All built-in tools now have full TypeBox schemas, return types, descriptions, and behavioral policies in `05-agent-model.md`.

- **C1** `WebSearchResult = { title, url, snippet }` — minimal, no optional fields.
- **C2** `web_search` backend — pluggable `WebSearchProvider` interface; default is DuckDuckGo HTML scrape (no API key). Alt providers (Brave, Tavily) are Day 2.
- **C3** `web_fetch` HTTP policy — http(s) only, ≤5 redirects, 5 MiB cap, TLS on, plain-text conversion for HTML (format-agnostic return), 120s timeout.
- **C4** `write_artifact` / `read_artifact` — full TypeBox schemas in `05-agent-model.md`; `04-artifact-store.md` reduced to brief reference.
- **C5** `bash` truncation — independent 32 KiB per-stream; `BashResult.truncated: { stdout, stderr }` flag + `[truncated to 32 KiB]` marker.

### Group D: Core Mechanics "How?" — RESOLVED (11)

Behavior described in prose but implementation mechanism unspecified. ADRs 8 and 9 plus `user-intentions.md` capture the decisions.

- **D1** Event envelope construction — only `AgentBody` constructs envelopes; TUI/CLI publish raw payloads.
- **D2** Grace turn — none in v1; loop terminates on pi-agent's `stopReason` (ADR 8).
- **D3** `notify` recipient count — `EventBus.subscriberCount(subject)`; ADR 9 §4.
- **D4** `AgentMessage` → `TurnRecord` serialization — `role` from message, `content = JSON.stringify(AgentMessage)`.
- **D5** Compaction range detection — moot for v1 (`enabled: false`); contract documented for Day 2.
- **D6/D11** Turn budgets — fields removed; no budgets in v1 (ADR 6).
- **D7** Tool `signal` combining — `AbortSignal.any([piSignal, AbortSignal.timeout(timeout)])`; ADR 9 §1.
- **D8** Streaming flush timer — `setTimeout` per stream, reset on flush, clear on `message_end`; ADR 9 §2.
- **D9** Self-receipt filtering — in `AgentBody` subscription callback, not `EventBus.publish`; ADR 9 §3.
- **D10** `ToolResult.terminate` — pi-agent's mechanism; Jie tools may set it but loop termination depends on LLM `stopReason`.

### Group E: Startup, Config & Error Handling — RESOLVED (7)

- **E1** Team blueprint fallback — `team_id` omitted → built-in minimal team; set → user team at standard paths; missing user team → hard fail.
- **E2** `jie -p` with no config — no init flow in either mode; all-defaults run with minimal team.
- **E3** MCP startup — WARN-and-skip at MCP layer; hard-fail at agent-load layer if blueprint tool can't resolve.
- **E4** `jie init` subcommand — none in v1; users create config manually.
- **E5** Config validation — strict; every error is a hard fail with clear message and exit 1.
- **E6** Prompt queue cap — deferred to Day 2 (backlog #19). v1 queue is unbounded, matching pi-agent.
- **E7** Graceful shutdown — 10s bounded; send abort via combined `AbortSignal`; force-exit on timeout.

### Group F: Missing Concrete Values — RESOLVED (5)

- **F1** Install version — v1 only supports `git clone` + `bun link --global`; polished install script and npm publish deferred to Day 2 (backlog #20).
- **F2** Git repo URL — `https://cuzfrog.github.com/jie`.
- **F3** `jie --version` source — walk-up from `import.meta.dirname` to find umbrella `package.json`; fallback `0.0.0-dev`.
- **F4** `memory_turns` DDL — full DDL already in migration block.
- **F5** `read_file` — built-in platform tool (ADR 10); `write_file` documented as Day 2.

### Group G: Deferred/TBD — RESOLVED (2)

- **G1/G2** TBD pointers to non-existent "Storage Maintenance chapter" — replaced with backlog #7 references. v1 retention: keep everything indefinitely.

### Group H: Implementer-grade gaps — RESOLVED (14 of 14)

**Group H is closed.** All 14 implementer-grade items are resolved. Brief one-liner per item, full detail in the `Resolved in H` table below.

- **H1** `prepareNextTurn` spec/code mismatch — row rewritten to "— (not wired in v1; ...)" with cross-reference; `pi-agent-api-reference.md:95` updated.
- **H2** Minimal team tools → `[bash, read_file, write_file]`. `minimal-team.md` updated.
- **H3** `write_file` is a **v1 platform tool**; platform/team enforcement split captured in **ADR 11**. ADR 10 amended.
- **H4** `tools/` directory listing fixed; all eight built-ins now in `monorepo-structure.md` and `00-overview.md`.
- **H5** `agent.idle` published on **every** `agent_end` (error/aborted/length too). Explicit note added in `03-event-system.md` "Agent Idle" section.
- **H6** `beforeToolCall` row wording fixed; Jie does not use the hook to block execution in v1.
- **H7** Team-blueprint loader is in `jie-platform/team/`. **ADR 12** captures the package boundary (jie-platform agnostic of jie-team). New `jie team install` CLI command. ADR 3 amended.
- **H8** `subscribe:` field is "yes (may be empty `[]`)" with clarifying note.
- **H9** `PlatformEventPayload` type-narrowing boundary explicit: domain event payload types live in `jie-team/05-event-types.md`; platform treats all string types as opaque.
- **H10** `task_id` is a business identifier, not a platform concept. Defensive note in `05-agent-model.md` `notify` section cross-references ADR 7 and ADR 12.
- **H11** 4 KiB truncation applies to the **event payload only**; the LLM sees the full value. Note added in `05-agent-model.md`.
- **H12** No platform-reserved key for in-flight tracking; team owns its key scheme. Note added in `08-memory.md`.
- **H13** Code-Lens is generic MCP; dev team declares the dependency in its manifest. `code-lens/service.md` and `09-deployment.md` aligned with WARN-and-skip + cascade.
- **H14** `agent.queue.update` event (mirroring pi's `queue_update`); TUI subscribes. Added to `03-event-system.md` Subject Schema and Platform Event Payloads.

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
| **H** | **Implementer-grade gaps** | **RESOLVED (14 of 14)** |
