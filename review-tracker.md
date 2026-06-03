# Review Tracker — jie-platform Implementer Gaps

> Goal: Identify every gap that would block an implementer from writing working code.
> Status: `open` = unresolved; `resolved` = decided and reflected in specs.

---

## Group A: Spec Conflicts — RESOLVED

Direct contradictions between files or within the same file that would crash at implement time.

| # | Files | Issue | Status |
|---|---|---|---|
| A1 | `04-artifact-store.md:13` vs `ui/tui.md:26,62` | `ArtifactStore.list(prefix: string)` vs TUI calls `list({ work_id })` — signature mismatch | resolved — TUI fixed to call `list(prefix)` per store interface |
| A2 | `03-event-system.md:72` vs `05-agent-model.md:229` | `agent.tool.result.output`: one says always `string`, the other says `null` on throw | resolved — changed event system to `string | null` (tool throws → null output) |
| A3 | `05-agent-model.md:179` vs examples lines 105,191-192 | `notify(input: { topic, prompt })` defined as object param, but all usage examples pass positional args | resolved — added note: examples use shorthand; actual LLM call uses object per TypeBox schema |
| A4 | `05-agent-model.md:321` vs `05-agent-model.md:388` | Compaction `enabled`: integration table says `true`, prose says `false` for v1 | resolved — table fixed to `enabled: false` (Group K decision) |
| A5 | `00-overview.md:13` vs `ui/tui.md:71-72` | `agent_key` described as "persistent" but TUI says "gets a new `agent_key` on restart" | resolved — v1 has no mid-process agent restart; keys stable across all runs |
| A6 | `08-memory.md:44` vs `08-memory.md:44-45` | `session_id`: "mints a new `session_id`" on every start vs "restart within same process run (same session_id)" | resolved — removed "restart within same process run" (never happens in v1); always new session |
| A7 | `ui/tui.md:3` vs `monorepo-structure.md:14` | TUI path: `packages/tui/` vs actual package `packages/jie-tui/` | resolved — fixed to `packages/jie-tui/` |
| A8 | `ui/tui.md:8-9` vs `monorepo-structure.md:43` | TUI imports `@jie-platform/core` but actual package name is `@cuzfrog/jie-platform` | resolved — imports fixed to `@cuzfrog/jie-platform` |
| A9 | `03-event-system.md:74` vs `05-agent-model.md:275,11-monitoring.md:28,34` | Domain event payload type lacks `error` field, but specs reference one | resolved — monitoring spec fixed; error is in `prompt` string, not separate field |

---

## Group B: Undefined pi-agent Types — RESOLVED

Types from `@earendil-works/pi-agent-core` used throughout the spec but never defined or linked.

| # | Files | Issue | Status |
|---|---|---|---|
| B1 | `05-agent-model.md:12,22-28` | `ToolSpec` — described in prose table but no TypeScript `type ToolSpec = string` or parsing function | resolved — ToolSpec = string union; parse/validate deferred to implementation |
| B2 | `05-agent-model.md:328-398`, `08-memory.md:15,24,78` | `AgentMessage` — pi-agent type used in `persist()`, `restore()`, adaptation layer; never defined | resolved — documented in pi-agent-api-reference.md |
| B3 | `08-memory.md:37,77` | `CompactionSummaryMessage` — used to detect compaction; never defined | resolved — documented in pi-agent-api-reference.md |
| B4 | `05-agent-model.md:323` | `AgentLoopTurnUpdate` — pi-agent type used in `prepareNextTurn`; never defined | resolved — documented in pi-agent-api-reference.md |
| B5 | `05-agent-model.md:134,159,332-340` | `AgentTool` — pi-agent target type for tool adaptation; table maps fields but never shows the interface | resolved — documented in pi-agent-api-reference.md |
| B6 | `05-agent-model.md:239,247` | `Agent` class — `agent.subscribe()`, `agent.prompt()`, `agent.continue()`, `agent.steer()`, `agent.state` used but API never documented | resolved — documented in pi-agent-api-reference.md |
| B7 | `05-agent-model.md:320,388` | `transformContext` hook — pi-agent feature; signature not shown | resolved — documented in pi-agent-api-reference.md |
| B8 | `05-agent-model.md:322-323` | `convertToLlm`, `prepareNextTurn` — pi-agent options; signatures and contracts not documented | resolved — documented in pi-agent-api-reference.md |
| B9 | `05-agent-model.md:386` | `agent.state` shape — `state.tools`, `state.systemPrompt`, `state.model`, `state.messages` referenced; shape and mutability undocumented | resolved — AgentState documented in pi-agent-api-reference.md |
| B10 | `05-agent-model.md:141` | `TSchema` — described as TypeBox, but no import path or exact type | resolved — TypeBox `TSchema` from `@earendil-works/pi-ai`; Jie tools use it directly via pi-agent's type system |
| B11 | `05-agent-model.md:325` | `steeringMode: "all"` — meaning and valid values never defined | resolved — QueueMode documented in pi-agent-api-reference.md |
| B12 | `05-agent-model.md:326` | `toolExecution: "sequential"` — meaning and valid values never defined | resolved — ToolExecutionMode documented in pi-agent-api-reference.md |

**Resolved:** Created `specs/jie-platform/pi-agent-api-reference.md` with comprehensive API documentation. Cross-referenced in `05-agent-model.md`, `08-memory.md`, `03-event-system.md`.

---

## Group C: Tool Implementation Gaps

Tools declared but underspecified to the point of being un-implementable.

| # | Files | Issue | Status |
|---|---|---|---|
| C1 | `05-agent-model.md:218` | `WebSearchResult` type — referenced but never defined (what fields?) | open |
| C2 | `05-agent-model.md:218-219` | `web_search` — no backend specified (DuckDuckGo? Google API? SerpAPI?). No auth, rate limiting, or result format | open |
| C3 | `05-agent-model.md:220` | `web_fetch` — no HTTP client policy (follow redirects? max depth? UA string? TLS validation? URL allowlist? max response size?) | open |
| C4 | `04-artifact-store.md:36-37` | `write_artifact`/`read_artifact` — no TypeBox schema, no LLM-facing description, no return type docs (unlike `notify`, `bash`, `web_search`, `web_fetch`) | open |
| C5 | `05-agent-model.md:213` | `bash` truncation: "stdout + stderr combined truncated to 64 KiB" — but `BashResult` has separate `stdout` and `stderr`. How to split truncated combined output back? Where does the truncation note appear? | open |

---

## Group D: Core Mechanics "How?"

Behavior described in prose but implementation mechanism unspecified.

| # | Files | Issue | Status |
|---|---|---|---|
| D1 | `03-event-system.md:18,48-59`, `05-agent-model.md:242-261` | Event envelope construction — who wraps `AgentEvent`? TUI publishes `leader.prompt` but has no `agent_role` or `agent_key`. What values go in the envelope? | open |
| D2 | `05-agent-model.md:360,392-396` | Grace turn detection — "Jie inspects the assistant message. If the LLM did not call `notify`..." — how? Scan `toolResults` in `turn_end`? Parse message text? Mechanism unspecified. | open |
| D3 | `05-agent-model.md:186` | `notify` recipient count — "returns `recipients: <subscriber count>`" — count of what? Active agent bodies? Callbacks on bus? Counting mechanism undefined. | open |
| D4 | `08-memory.md:15,50-59` | `AgentMessage` → `TurnRecord` serialization — `persist()` takes `AgentMessage` (pi-agent type) but `TurnRecord` has `role, content`. How is the mapping done? Is content JSON? Plain text? | open |
| D5 | `08-memory.md:36-41,77` | Compaction range detection — body must compute `compactedSeqRange: [number, number]` from the `CompactionSummaryMessage`. How? | open |
| D6 | `10-configuration.md:24-25,38-39` | Turn budgets (`error_turn_budget`, `total_turn_budget`) — enforcement mechanism never described. Not in pi-agent integration table. Is this a Jie wrapper or pi-agent feature? | open |
| D7 | `05-agent-model.md:142,339` | Tool `signal` parameter — `execute(input, ctx, signal?)`. What happens when pi-agent provides no signal? The adaptation layer "combines" signals — handle `undefined`? | open |
| D8 | `03-event-system.md:90-97`, `05-agent-model.md:362-369` | Streaming flush timer — "200ms" but mechanism unspecified. `setTimeout`? `setInterval`? Debounced flush? How to handle bursts? | open |
| D9 | `03-event-system.md:116`, `05-agent-model.md:185` | Self-receipt filtering — "event bus filters self-receipt." Is this in `InProcessEventBus.publish()` or in the `AgentBody` subscription callback? | open |
| D10 | `05-agent-model.md:147` | `ToolResult.terminate` — described as "hint: stop LLM loop after this tool batch." How does Jie act on this hint? Force `agent.idle`? Skip grace turn? Undefined. | open |
| D11 | `10-configuration.md:24-25` | Turn budget semantics — "decrements on turns consuming tool errors" vs "decrements on every LLM turn." Budget exhaustion → what? Grace turn? Force idle? | open |

---

## Group E: Startup, Config & Error Handling

Edge cases and failure modes that an implementer must handle but are unspecified.

| # | Files | Issue | Status |
|---|---|---|---|
| E1 | `09-deployment.md:44`, `ui/cli.md:27` | Team blueprint fallback — "or built-in fallback from `jie-team`." When exactly? `team_path` missing? directory absent? config absent? user cancelled init? | open |
| E2 | `ui/cli.md:57` | `jie -p` with no config — "walk up to find config (or init)." Does it drop to interactive init before processing `-p` instruction? Or fail? | open |
| E3 | `10-configuration.md:76-78`, `09-deployment.md:112-115` | MCP server connection failure at startup — hard exit? skip and warn? skip silently? | open |
| E4 | `ui/cli.md`, `12-installation.md` | `jie init` subcommand — interactive init described as auto-triggered but no explicit `jie init` command exists for manual re-init | open |
| E5 | `10-configuration.md`, `ui/cli.md` | Config validation — invalid YAML? unknown keys? missing fields? invalid `team_id` charset? Error handling unspecified. | open |
| E6 | `05-agent-model.md:379`, `08-memory.md:70` | Prompt queue — no max size. No backpressure. Could grow unbounded. | open |
| E7 | `09-deployment.md` | Graceful shutdown — "finish current turn" but what if the turn is blocked on a tool call? Abort and wait? Force kill after timeout? | open |

---

## Group F: Missing Concrete Values

Placeholders and deferred decisions an implementer needs.

| # | Files | Issue | Status |
|---|---|---|---|
| F1 | `12-installation.md:44` | Install version — "latest stable" is not a concrete semver | open |
| F2 | `12-installation.md:55` | Git repo URL — `<repo>` placeholder | open |
| F3 | `ui/cli.md:77-84` | `jie --version` source — package.json? hardcoded constant? build-time injection? | open |
| F4 | `04-artifact-store.md:67` | `memory_turns` DDL hidden behind `...` — implementer must cross-reference `08-memory.md` for `TurnRecord` fields and infer DDL | open |
| F5 | `00-overview.md:22` | Glossary lists `read_file` as example tool — but `read_file` is not a built-in tool (it's an MCP tool from code-lens). Misleading for implementer. | open |

---

## Group G: Deferred/TBD

Explicit TBD markers that may block v1 decisions.

| # | Files | Issue | Status |
|---|---|---|---|
| G1 | `04-artifact-store.md:51` | "GC, archival, and compaction policy is deferred to the **Storage Maintenance** chapter (TBD)" | open |
| G2 | `08-memory.md:64` | "GC and pruning are deferred to the Storage Maintenance chapter (TBD)" — same TBD chapter | open |

---

## Summary

| Group | Theme | Severity |
|---|---|---|
| A | Spec conflicts | Resolved — 9 conflicts fixed |
| B | Undefined pi-agent types | Resolved — dedicated API reference file created |
| C | Tool implementation gaps | High — tools un-implementable as specified |
| D | Core mechanics "how?" | High — behavior described, mechanism absent |
| E | Startup/config/errors | Medium — edge cases, error handling |
| F | Missing concrete values | Medium — fill-in-the-blank |
| G | Deferred/TBD | Low — accepted v1 scope gaps |
