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

## Group C: Tool Implementation Gaps — RESOLVED

All built-in tools now have full TypeBox schemas, return types, descriptions, and behavioral policies. Captured in `05-agent-model.md`.

**Key decisions:**
- `WebSearchResult = { title, url, snippet }` — minimal, no optional fields.
- `web_search` backend: pluggable `WebSearchProvider` interface; default is DuckDuckGo HTML scrape (no API key). Alternative providers (Brave, Tavily) are a Day 2 concern.
- `web_fetch` HTTP policy: http(s) only, follow ≤5 redirects, 5 MiB body cap, TLS validation, plain-text conversion for HTML (format-agnostic return), inherit 120s timeout.
- `write_artifact` returns `{ key, created_at }` on success; tool error on storage failure.
- `read_artifact` returns `{ key, content, created_at } | null` — missing is normal, not a tool error.
- `bash` truncates `stdout` and `stderr` **independently to 32 KiB each**; `BashResult.truncated: { stdout, stderr }` reports clipping; truncated streams get a `[truncated to 32 KiB]` marker.

| # | Files | Issue | Status |
|---|---|---|---|
| C1 | `05-agent-model.md:218` | `WebSearchResult` type — referenced but never defined (what fields?) | resolved — `{ title, url, snippet }` |
| C2 | `05-agent-model.md:218-219` | `web_search` — no backend specified (DuckDuckGo? Google API? SerpAPI?). No auth, rate limiting, or result format | resolved — `WebSearchProvider` interface + DuckDuckGo HTML default; alt backends Day 2 |
| C3 | `05-agent-model.md:220` | `web_fetch` — no HTTP client policy (follow redirects? max depth? UA string? TLS validation? URL allowlist? max response size?) | resolved — http(s)-only, ≤5 redirects, 5 MiB cap, TLS on, plain text output, 120s timeout |
| C4 | `04-artifact-store.md:36-37` | `write_artifact`/`read_artifact` — no TypeBox schema, no LLM-facing description, no return type docs (unlike `notify`, `bash`, `web_search`, `web_fetch`) | resolved — full TypeBox schemas in `05-agent-model.md`; `04-artifact-store.md` reduced to brief reference |
| C5 | `05-agent-model.md:213` | `bash` truncation: "stdout + stderr combined truncated to 64 KiB" — but `BashResult` has separate `stdout` and `stderr`. How to split truncated combined output back? Where does the truncation note appear? | resolved — independent 32 KiB truncation per stream; `truncated: { stdout, stderr }` flag + marker on truncated stream |

---

## Group D: Core Mechanics "How?" — RESOLVED

Behavior described in prose but implementation mechanism unspecified.

**Key ADRs/intentions:**
- ADR 8 (no grace turn — trust the LLM): `./addrs/8-no-grace-turn.md`
- ADR 9 (AgentBody mechanisms: signal, streaming, self-receipt, subscriberCount): `./addrs/9-agent-body-mechanisms.md`
- User intentions: `./user-intentions.md`

| # | Files | Issue | Status |
|---|---|---|---|
| D1 | `03-event-system.md:18,48-59`, `05-agent-model.md:242-261` | Event envelope construction — who wraps `AgentEvent`? TUI publishes `leader.prompt` but has no `agent_role` or `agent_key`. What values go in the envelope? | resolved — only `AgentBody` constructs envelopes; TUI/CLI publish raw payloads; user's intent captured in `user-intentions.md` |
| D2 | `05-agent-model.md:360,392-396` | Grace turn detection — "Jie inspects the assistant message. If the LLM did not call `notify`..." — how? Scan `toolResults` in `turn_end`? Parse message text? Mechanism unspecified. | resolved — no grace turn in v1; loop terminates on pi-agent's `stopReason`; see ADR 8 |
| D3 | `05-agent-model.md:186` | `notify` recipient count — "returns `recipients: <subscriber count>`" — count of what? Active agent bodies? Callbacks on bus? Counting mechanism undefined. | resolved — `EventBus.subscriberCount(subject)` added; `notify` returns that count; see ADR 9 §4 |
| D4 | `08-memory.md:15,50-59` | `AgentMessage` → `TurnRecord` serialization — `persist()` takes `AgentMessage` (pi-agent type) but `TurnRecord` has `role, content`. How is the mapping done? Is content JSON? Plain text? | resolved — `role` from `AgentMessage.role`; `content = JSON.stringify(AgentMessage)`; see `08-memory.md` Serialization section |
| D5 | `08-memory.md:36-41,77` | Compaction range detection — body must compute `compactedSeqRange: [number, number]` from the `CompactionSummaryMessage`. How? | resolved — moot for v1 (compaction disabled per `enabled: false`); spec documents contract for Day 2 when enabled |
| D6 | `10-configuration.md:24-25,38-39` | Turn budgets (`error_turn_budget`, `total_turn_budget`) — enforcement mechanism never described. Not in pi-agent integration table. Is this a Jie wrapper or pi-agent feature? | resolved — fields removed from `10-configuration.md`; covered by ADR 6 |
| D7 | `05-agent-model.md:142,339` | Tool `signal` parameter — `execute(input, ctx, signal?)`. What happens when pi-agent provides no signal? The adaptation layer "combines" signals — handle `undefined`? | resolved — `AbortSignal.any([piSignal, AbortSignal.timeout(timeout)])` if signal provided; `AbortSignal.timeout` alone if not; see ADR 9 §1 |
| D8 | `03-event-system.md:90-97`, `05-agent-model.md:362-369` | Streaming flush timer — "200ms" but mechanism unspecified. `setTimeout`? `setInterval`? Debounced flush? How to handle bursts? | resolved — `setTimeout` per stream, reset on flush, clear on `message_end`; see ADR 9 §2 |
| D9 | `03-event-system.md:116`, `05-agent-model.md:185` | Self-receipt filtering — "event bus filters self-receipt." Is this in `InProcessEventBus.publish()` or in the `AgentBody` subscription callback? | resolved — filtered in `AgentBody` subscription callback; keeps `EventBus` transport-agnostic; see ADR 9 §3 |
| D10 | `05-agent-model.md:147` | `ToolResult.terminate` — described as "hint: stop LLM loop after this tool batch." How does Jie act on this hint? Force `agent.idle`? Skip grace turn? Undefined. | resolved — not Jie's concern; `terminate` is pi-agent's mechanism; Jie tools may set it but loop termination depends on LLM `stopReason` |
| D11 | `10-configuration.md:24-25` | Turn budget semantics — "decrements on turns consuming tool errors" vs "decrements on every LLM turn." Budget exhaustion → what? Grace turn? Force idle? | resolved — budgets removed entirely per ADR 6; see ADR 8 (no grace turn) |

---

## Group E: Startup, Config & Error Handling — RESOLVED

Startup, config discovery, validation, MCP failure handling, and shutdown are all fully specified. Captured in `10-configuration.md`, `09-deployment.md`, `12-installation.md`, and `ui/cli.md`. New minimal team blueprint in `jie-team/minimal-team.md`.

**Key decisions:**
- **No interactive init flow.** Both `jie` (TUI) and `jie -p` walk up for config; if absent, run with all defaults. The built-in minimal team is the default. To customize, the user creates `.jie/config.yaml` manually.
- **Team resolution order**: `.jie/teams/<team_id>/` (project) → `~/.jie/teams/<team_id>/` (global) → built-in default. If `team_id` is set but no manifest found → startup fails. Default is reached only by omitting `team_id`.
- **Strict config validation.** YAML parse, unknown key, invalid value, missing user team — any of these is a hard fail with a clear error and exit code 1. No silent fallbacks.
- **MCP startup**: per-server connect failure logs WARN and skips; team startup continues. Cascade: if the team's blueprint depends on a missing tool, the team fails to start with a precise error.
- **Graceful shutdown**: 10-second bounded. Send abort to in-flight operations (agent loops, tool calls, MCP requests) via the combined `AbortSignal`; wait up to 10s; force-exit on timeout.
- **No `jie init` subcommand** in v1.
- **Prompt queue cap** deferred to Day 2 (backlog #19). v1's `AgentBody` queue is unbounded, matching pi-agent's behavior.

| # | Files | Issue | Status |
|---|---|---|---|
| E1 | `09-deployment.md:44`, `ui/cli.md:27` | Team blueprint fallback — "or built-in fallback from `jie-team`." When exactly? `team_path` missing? directory absent? config absent? user cancelled init? | resolved — `team_id` omitted → built-in minimal team; `team_id` set → user team at standard paths; missing user team → hard fail |
| E2 | `ui/cli.md:57` | `jie -p` with no config — "walk up to find config (or init)." Does it drop to interactive init before processing `-p` instruction? Or fail? | resolved — no init flow in either mode; all-defaults run with minimal team |
| E3 | `10-configuration.md:76-78`, `09-deployment.md:112-115` | MCP server connection failure at startup — hard exit? skip and warn? skip silently? | resolved — WARN-and-skip at MCP layer; fail-and-exit at agent-load layer if a blueprint tool can't resolve |
| E4 | `ui/cli.md`, `12-installation.md` | `jie init` subcommand — interactive init described as auto-triggered but no explicit `jie init` command exists for manual re-init | resolved — no `jie init` in v1; users create config manually |
| E5 | `10-configuration.md`, `ui/cli.md` | Config validation — invalid YAML? unknown keys? missing fields? invalid `team_id` charset? Error handling unspecified. | resolved — strict validation; every error is a hard fail with clear message; see `10-configuration.md` Config Validation |
| E6 | `05-agent-model.md:379`, `08-memory.md:70` | Prompt queue — no max size. No backpressure. Could grow unbounded. | deferred to Day 2 — backlog #19 (cap value, drop policy, observability) |
| E7 | `09-deployment.md` | Graceful shutdown — "finish current turn" but what if the turn is blocked on a tool call? Abort and wait? Force kill after timeout? | resolved — 10s bounded shutdown; send abort via combined `AbortSignal`; force-exit on timeout |

---

## Group F: Missing Concrete Values — RESOLVED

All five items resolved. Captured across `12-installation.md`, `ui/cli.md`, `00-overview.md`, `05-agent-model.md`, `monorepo-structure.md`, `backlog.md`.

**Key decisions:**
- **F1**: v1 only supports local install (`git clone` + `bun link --global`). The polished install script (`https://install.jie.dev`) and npm publish are deferred to Day 2 — see backlog #20.
- **F2**: Public git URL is `https://cuzfrog.github.com/jie` (per project owner). Substituted in the Manual Install section.
- **F3**: `jie --version` reads from the umbrella `@cuzfrog/jie` package.json by walking up from `import.meta.dirname` until a `name: "@cuzfrog/jie"` package.json is found. Mirrors pi's `getPackageDir()` / `VERSION` pattern (`@earendil-works/pi-coding-agent/src/config.ts`). Fallback: `0.0.0-dev`.
- **F4**: Already resolved — the migration block in `04-artifact-store.md` shows the full `memory_turns` DDL with all `TurnRecord` fields, no `...` placeholder.
- **F5**: `read_file` is a built-in platform tool (mirrors pi's `read`). Added to `jie-platform/tools/`. `write_file` is documented as needed by the dev team Implementer but deferred to Day 2 (entangled with frozen-rule enforcement, jie-team backlog #8).

| # | Files | Issue | Status |
|---|---|---|---|
| F1 | `12-installation.md:44` | Install version — "latest stable" is not a concrete semver | resolved — defer to Day 2 (backlog #20); v1 only supports local install via `bun link` |
| F2 | `12-installation.md:55` | Git repo URL — `<repo>` placeholder | resolved — `https://cuzfrog.github.com/jie` |
| F3 | `ui/cli.md:77-84` | `jie --version` source — package.json? hardcoded constant? build-time injection? | resolved — walk-up from `import.meta.dirname` to find umbrella `package.json`; fallback `0.0.0-dev` |
| F4 | `04-artifact-store.md:67` | `memory_turns` DDL hidden behind `...` — implementer must cross-reference `08-memory.md` for `TurnRecord` fields and infer DDL | resolved — full DDL already in migration block |
| F5 | `00-overview.md:22` | Glossary lists `read_file` as example tool — but `read_file` is not a built-in tool (it's an MCP tool from code-lens). Misleading for implementer. | resolved — `read_file` is now a built-in platform tool; `write_file` noted as Day 2 |

---

## Group G: Deferred/TBD — RESOLVED

Both items referenced a non-existent "Storage Maintenance chapter (TBD)". Resolved by replacing the dangling pointer with the existing backlog reference (backlog item #7, which already captures the chapter's scope). v1's retention policy ("keep everything indefinitely") is unchanged.

| # | Files | Issue | Status |
|---|---|---|---|
| G1 | `04-artifact-store.md:51` | "GC, archival, and compaction policy is deferred to the **Storage Maintenance** chapter (TBD)" | resolved — replaced TBD pointer with backlog #7 reference |
| G2 | `08-memory.md:64` | "GC and pruning are deferred to the Storage Maintenance chapter (TBD)" — same TBD chapter | resolved — replaced TBD pointer with backlog #7 reference |

---

## Summary

| Group | Theme | Severity |
|---|---|---|
| A | Spec conflicts | Resolved — 9 conflicts fixed |
| B | Undefined pi-agent types | Resolved — dedicated API reference file created |
| C | Tool implementation gaps | Resolved — all built-in tools fully specified |
| D | Core mechanics "how?" | Resolved — ADRs 8 and 9, plus user-intentions.md |
| E | Startup/config/errors | Resolved — startup, validation, MCP, shutdown all specified |
| F | Missing concrete values | Resolved — install deferred to Day 2, repo URL/version source set, `read_file` added as built-in |
| G | Deferred/TBD | Resolved — TBD pointers replaced with backlog #7 references |
