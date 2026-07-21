# Agent Model

Three concepts make up the agent model: `AgentSoul` — the immutable behavioral profile (model, system prompt, tools, subscriptions); `AgentBody` — the runtime that wraps a pi-agent-core `Agent` and bridges it to the event bus; `ExecutionContext` — the per-tool-call context carrying identity and storage handles. Souls are derived from the team blueprint at startup; the platform builds one body per agent instance; bodies are the only publishers on the bus.

## AgentSoul

```typescript
interface AgentSoul {
  readonly role: string;                       // role identifier — the agent's .md filename stem
  readonly model: string;                      // '<provider>/<model_id>', resolved via pi-ai's getModel
  readonly systemPrompt: string;               // prose body of the agent's .md file, verbatim
  readonly tools: ReadonlyArray<string>;       // tool spec strings, resolved through the ToolRegistry
  readonly subscribe: ReadonlyArray<string>;   // un-scoped domain topics; body listens on custom.{teamId}.{topic}
}
```

No roles are hardcoded — the platform parses declarative team config. The `systemPrompt` is one block the LLM receives as its system message; no fragmentation into identity/tools_guide/constraints. Agents communicate exclusively through `notify` (publishing to topics) and subscription-based ingress; they hold no references to each other.

### ToolRegistry

Central catalog of all tools available to agents, storage-agnostic: a `Tool` is a `Tool` whether its `execute` runs locally or delegates over MCP.

```typescript
interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];
  list(): Tool[];
}
```

Each entry in `AgentSoul.tools` is a spec string. `resolve` matches the segment after the last `:` (the whole string when there is none) against registered tool names using anchored `Bun.Glob` matching (`*`, `?`): a plain name resolves to itself, a glob to zero-or-more tools. Whether zero matches is a startup failure is the caller's policy (`10-configuration.md` "MCP Server Configuration"). Built-ins are registered at platform startup; MCP-provided and user-defined tools are registered onto the registry by the platform — the body cannot tell where a tool executes (ADR 4).

## Team Blueprint

The blueprint lives at `.jie/teams/<team_id>/` (file layout, discovery, model resolution: `10-configuration.md`):

```
.jie/teams/default/
  TEAM.md              # YAML frontmatter: leader
  leader.md            # one .md per role — the filename stem is the role identifier
  worker_a.md
```

`TEAM.md` declares `leader: <role>`. Every other `.md` file is an agent definition: YAML frontmatter declares the mechanical surface, the prose body becomes `AgentSoul.systemPrompt`.

| Field | Required | Meaning |
|---|---|---|
| `model` | no | `<provider>/<model_id>`; when absent, inherited from the user's global default (`10-configuration.md` "Model Resolution"). Always a resolved string by soul-construction time. |
| `tools` | yes | Tool spec strings resolved through the `ToolRegistry` at body construction. |
| `subscribe` | no | Un-scoped domain topic names. Entries starting with `agent.` are rejected at parse time (`subscribe_rejects_platform_topic: <topic>`) and the team fails to start — platform events (`agent.*`) are observer-only, never agent-consumed; the platform manages isolation so team authors never see platform subjects. |

Each role maps to a persistent `agentKey = {role}-{N}`; v1 has exactly one instance per role (keys are `{role}-1`). Leader identification is a team-level fact: a multi-agent team (≥2 `.md` files) requires `TEAM.md` with a `leader:` field referencing an existing role; a single-agent team without `TEAM.md` makes its only role the leader implicitly. The loader passes `isLeader` to the body's constructor; it surfaces in `AgentInfo` (carried by `system.team.loaded`) and is **not** used for event routing — every body is addressed by `agentKey` (see "Subscription Model" below).

Malformed blueprints are hard startup failures with typed errors (invalid frontmatter, missing `tools`, invalid team_id/role charset, duplicate role stems, missing or mismatched `TEAM.md` leader; see `JiePlatformError` codes). The load cascade and per-team failure handling live in `10-configuration.md`.

## ExecutionContext

Passed to every tool `execute`. Closed once at tool-adaptation time — never varies within a body's lifetime. Provides identifiers and storage; does **not** expose the event bus.

```typescript
interface ExecutionContext {
  readonly sessionId: string;      // per process run × team (ADR 17); shared by all agents of one team in one process
  readonly teamId: string;
  readonly agentKey: string;       // {role}-{N}
  readonly agentRole: string;
  readonly artifactStore: ArtifactStore;
}
```

## Tool

Jie tools use TypeBox schemas (matching `@earendil-works/pi-ai`'s type system).

```typescript
interface Tool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly label: string;          // human-readable name for UI / telemetry
  readonly timeout?: number;       // per-invocation timeout in ms (default 120_000)
  readonly parameters: TSchema;    // TypeBox schema — the LLM-visible tool schema
  execute(input: TInput, executionContext: ExecutionContext, signal?: AbortSignal): Promise<ToolResult>;
}

interface ToolResult {
  readonly content: string;        // text returned to the LLM conversation
  readonly details?: unknown;      // structured payload for afterToolCall hooks / telemetry; never shown to the LLM
  readonly terminate?: boolean;    // pi-agent hint: stop after this tool batch
}
```

Except for the built-in `notify` (which receives its `EventManager` as a construction dependency), tools have no awareness of the event bus; custom team-defined tools cannot publish events. Business identifiers (`task_id`, work ids, …) are never a platform concept — the platform treats tool inputs as opaque and the receiving LLM extracts identifiers from message text.

**Errors.** Failures throw `JiePlatformError` (typed code + human-readable message); pi-agent surfaces the throw as an `isError` tool result and the LLM reads the message text and reasons. Error codes below are cited in lowercase for readability; the canonical codes are the `JiePlatformError` constants.

**Timeout.** The adapter combines any pi-agent-provided signal with `AbortSignal.timeout(tool.timeout ?? 120_000)` (`AbortSignal.any` when both exist). `bash` overrides the default to 300s.

### Tool Adaptation to pi-agent

At body construction, each Jie `Tool` is wrapped into pi-agent-core's `AgentTool`:

| pi-agent field | Adaptation |
|---|---|
| `name`, `description`, `label`, `parameters` | Copied from `Tool` (the TypeBox schema is passed directly) |
| `prepareArguments(raw)` | `Value.Check(parameters, raw)`; throws on mismatch and pi-agent surfaces the throw as a tool error. No coercion — the LLM's args must already match the schema. |
| `execute(toolCallId, params, signal?, onUpdate?)` | Combines signals per the timeout rule, calls `tool.execute(params, ctx, combined)`, wraps the return as `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate ?? false }`. Throws (including `AbortError`) propagate. The `onUpdate` callback is not bridged — v1 tools return one final `ToolResult`. |
| `executionMode` | Always `"sequential"` |

Day 2: bridging `onUpdate` (live partial results), parallel tool execution.

## Built-in Tools

Registered at platform startup by `createToolRegistry`:

| Tool | Purpose |
|---|---|
| `bash` | shell commands in the workspace root |
| `read_file` | bounded text-file reads |
| `write_file` | text-file writes (overwrite) |
| `edit` | search-and-replace inside a file, with diff preview |
| `read_artifact` / `write_artifact` | key-value work-product store |
| `todo_write` | live task checklist |
| `notify` | publish to the team event bus (see "notify and the Subscription Model") |
| `web_search` / `web_fetch` | web access |

Shared conventions: file paths resolve against the workspace root and must stay inside it (`path_escape` / `workdir_escape`); text tools are UTF-8 only; the 120s default timeout applies unless noted.

### bash

```typescript
bash(input: { command: string; workdir?: string })
```

Execs `/bin/sh -c` in the workspace root (or a `workdir` resolved inside it via `realpath`; escape throws `workdir_escape`). The platform's own 300s timeout sends SIGTERM then SIGKILL after a 5s grace and throws `command_timed_out`; OS-level signal kills from outside the platform surface as normal non-zero exits (`exit_code: 143` for SIGTERM, `137` for SIGKILL) — the LLM branches on `exit_code > 128`. stdout and stderr are captured independently, each clipped at 32 KiB with a `[truncated to 32 KiB]` marker. The `content` format:

```
exit_code: <N>[ ( command failed)  when N != 0]
--- stdout ---
<output>
--- stderr ---
<output>
```

Empty sections are omitted entirely; the command is not echoed. `details: { exitCode, truncated: { stdout, stderr } }`. Bash never throws on non-zero exit — throwing would discard stdout/stderr, which is what the LLM asked for.

### read_file and write_file (ADR 9)

```typescript
read_file(input: { path: string; offset?: number; limit?: number })
write_file(input: { path: string; content: string })
```

The platform enforces workspace-root containment only (`path_escape`); module-boundary enforcement is the team's concern (see "Boundary Enforcement"). `read_file`: `offset` is a 1-indexed line number clamped to ≥ 1, `limit` is a line count (values < 1 mean unbounded); default truncation is 2000 lines or 50 KiB whichever first, with a `[Truncated: showing X of Y lines (50 KiB limit)]` marker; non-UTF-8 bytes throw `unsupported_encoding`; other errors: `file_not_found`, `is_a_directory`, `permission_denied`, `i_o_error`. `write_file`: writes `content` verbatim, overwrites (idempotent, no append mode), auto-creates parent directories, caps content at 5 MiB (`file_too_large`); LLM-visible text is `Successfully wrote <N> bytes to <path>`, `details: { path, bytesWritten, createdAt }`. Full rationale in ADR 9.

### edit

```typescript
edit(input: { path: string; old_string: string; new_string: string; replace_all?: boolean })
```

Search-and-replace inside a workspace text file. Zero occurrences throws `no_match`; more than one with `replace_all` false throws `ambiguous_match` — the LLM must narrow `old_string` or opt into `replace_all`. On success `content` is a summary line plus a unified-diff preview; for files over 5000 lines the diff is omitted (use `write_file` for wholesale rewrites). `details: { kind: "diff", path, replacementsCount, beforeBytes, afterBytes, diff }` — the TUI renders the diff from the telemetry payload. Same workspace/encoding errors as `read_file`, plus `disk_full` on write.

### todo_write

```typescript
todo_write(input: { todos: ReadonlyArray<TodoItem> })

interface TodoItem {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed";
  readonly active_form?: string;
}
```

Replaces (does not merge with) the agent's live checklist. The tool enforces: exactly one `in_progress` item when the list is non-empty (zero clears), no duplicate `content`, no empty `content` — violations throw `todo_write_invalid`. `content` summarizes the list and the current item; `details: { kind: "todos", todos }` carries the full list so the TUI renders the checklist from the same payload.

### write_artifact and read_artifact

LLM-facing shapes; the store's schema and validation live in `04-storage.md`:

```typescript
write_artifact(input: { key: string; content: string })
read_artifact(input: { key: string })
```

`write_artifact` overwrites the entry at `key` and returns `Stored artifact at <key> (N chars)` with `details: { key, created_at }`; the store validates the key charset `[A-Za-z0-9_./-]{1,256}` (`invalid_artifact_key`) and the 5 MiB content cap (`artifact_too_large`). `read_artifact` returns the content verbatim on hit (`details: { key, content, created_at }`); a miss returns `Artifact not found: <key>` as a normal result, not a tool error. The store is NOT team-scoped by the platform: two teams using the same key collide, so team-specific keys must embed the team id (available from `ExecutionContext`). Artifact content never travels in event payloads — events carry keys only.

### web_search

```typescript
web_search(input: { query: string; maxResults?: number })
```

Delegates to a pluggable `WebSearchProvider { search(query, maxResults): Promise<WebSearchResult[]> }`; the default scrapes DuckDuckGo HTML (no API key). `maxResults` defaults to 5 and is clamped into [1, 20] before the provider call. Provider failures (HTTP 429/5xx, network, zero results) throw `web_search_failed: <message>` — no retry in v1, no stack trace; the LLM reasons and may change query or fall back to `web_fetch`. `content` is a numbered `title / url / snippet` list; `details: { results, query, maxResults }`.

### web_fetch

```typescript
web_fetch(input: { url: string })   // content text + details { status, truncated }
```

| Policy | Value |
|---|---|
| Schemes | `http`/`https` only (`unsupported_scheme`) |
| Redirects | Bun default (up to 20); failure surfaces as `redirect_exhausted` |
| Body cap | 5 MiB, then `details.truncated` set |
| Content types | `text/*` and a curated set of structured `application/*` (json family, xml family, javascript family, form-urlencoded, yaml, toml, sql, graphql) return text; `text/html` is parsed with `node-html-parser` (script/style/nav/header/footer removed, entities decoded); anything else throws `unsupported_content_type` |
| Status | Final status after redirects in `details.status`; all status classes (incl. 4xx/5xx) are returned with the body — the LLM branches on status, non-2xx is never a typed error |
| Charset | Declared charset when Bun can decode it, else UTF-8 with replacement chars |
| Timeout | the 120s default |

## notify and the Subscription Model

### notify

A built-in tool; an agent can publish if and only if its soul lists `notify` in `tools`. It is the LLM's sole means of publishing an event.

```typescript
notify(input: { topic: string; prompt: string })
```

Behavior:

1. **Topic validation.** Rejects with `notify_invalid_topic: <reason>` when the topic is empty (`empty`), starts with `agent.` (`starts_with_agent_prefix` — platform events are observer-only), starts with `{team_id}.` (`starts_with_team_prefix` — the platform manages the scoping), or contains a null byte or control character (`contains_null_byte`).
2. **Prompt validation.** Rejects with `notify_prompt_too_long` when the prompt exceeds `EVENT_TEXT_TRUNCATION_BYTES` (4096 chars) — so `custom.*` payloads published via `notify` are never truncated in flight.
3. **Publish.** `Events.custom(sender, `${teamId}.${topic}`, prompt)` → bus topic `custom.{teamId}.{topic}`, envelope `sender: { kind: "agent", teamId, agentKey }`, payload `{ message, truncated }`. The LLM supplies the un-scoped topic; the body prefixes `{team_id}.` and the bus adds the `custom.` prefix.

Returns `Notification published on '<topic>'` with `details: { topic }`. The LLM continues processing — `notify` is a regular tool, not a loop-control signal, and does not end the turn (ADR 6).

### Subscription Model

User prompt ingress is the single `user.prompt` topic with payload `{ teamId, agentKey, prompt }` — the caller resolves "the leader" to an `agentKey` before publishing. The envelope, sender, and topic catalog are documented in `03-event-system.md`; this section documents body behavior only. At `start()`, each body subscribes to exactly:

| Bus topic | Filter | Effect |
|---|---|---|
| `user.prompt` | `payload.teamId` and `payload.agentKey` match this body | ingest the user prompt |
| `agent.interrupt` | `payload.teamId` and `payload.agentKey` match this body | abort the active run (`agent.abort()` when streaming) |
| `custom.{teamId}.{topic}` | one subscription per entry in `soul.subscribe`; events whose `sender.agentKey` equals the body's own key are dropped (self-receipt filter) | ingest peer notifications |

`isLeader` adds no subscription. The self-receipt filter lives in the body, not the bus: the transport is agent-identity-agnostic and a misbehaving subscriber cannot poison the publisher (per-subscriber error containment is in `03-event-system.md`).

Ingress formats the notification as a synthetic `user` message and feeds it to pi-agent:

| Source | Synthetic `user` content |
|---|---|
| `user.prompt` | `[user]: {prompt}` |
| `custom.{teamId}.{topic}` | `[{source_agent_key} on '{topic}']: {prompt}` — `topic` is the un-scoped name from the publisher's `notify` call |

If `agent.state.isStreaming`, the message goes onto the body's FIFO in-memory queue (not persisted; lost on restart); otherwise it is dispatched immediately via `agent.prompt()`. Queued messages are drained one at a time via `agent.followUp()` on `turn_end` / `agent_end`. Every enqueue and dequeue publishes `agent.prompt.queue.update` with `{ prompts: string[] }` — a snapshot of the synthetic message texts — which the TUI renders as the queued-prompt indicator. The queue is intentionally unbounded in v1.

## AgentBody

The public contract:

```typescript
interface AgentBody {
  readonly identity: AgentInfo;   // { teamId, role, agentKey, isLeader, model }
  start(): Promise<void>;
  stop(): void;
}
```

`createAgentBody(options)` builds the single concrete implementation from `agentKey`, `teamId`, `soul`, `isLeader`, `eventManager`, `artifactStore`, `memory`, `sessionId`, `toolRegistry`, `getApiKey`, and the resolved pi-ai `Model`. No inheritance — the body wraps pi-agent-core's `Agent`, which owns the LLM loop, tool execution, streaming, and context transformation. The soul is immutable; the body is the only publisher on the bus.

**`start()` ordering.** (1) Register the subscriptions above. (2) `memory.restore(agentKey, sessionId, teamId)` and push the rows into `agent.state.messages`. (3) If the restored history ends with a `user` or `toolResult` message, `agent.continue()` to resume the in-flight turn. (4) Drain anything that arrived on subscribed topics during startup via `agent.prompt()`. The body does not publish `agent.idle` at startup — a body that has never run a turn is idle by default. `stop()` unsubscribes everything.

**Agent construction.** The `Agent` is created with `sessionId`, `getApiKey`, an identity `transformContext` (compaction not wired in v1), `steeringMode: "all"`, `followUpMode: "all"`, `toolExecution: "sequential"`, and the telemetry hooks below. The body then sets `agent.state.systemPrompt` (the soul's prose), `agent.state.model` (publishing `agent.model.assigned` when a model is assigned), and `agent.state.tools` (the adapted `AgentTool[]`).

### Event Bridging

The body subscribes to pi-agent's `AgentEvent` stream and bridges to the bus:

| pi-agent event | Bus event |
|---|---|
| `turn_start` | `agent.turn.start` |
| `message_start`, `message_update`, `message_end` (assistant) | streaming pipeline → `agent.stream.chunk` / `agent.stream.end`; assistant `message_end` also publishes `agent.usage` when the message carries usage |
| `message_end` (every role) | `memory.persist(message, agentKey, sessionId, teamId)` — unconditional, no role check |
| `turn_end` | dequeue one queued message via `agent.followUp()`; publish `agent.prompt.queue.update` |
| `agent_end` | `agent.idle` with the final `stopReason`; also `system.error` when the run ended `error`/`aborted` with a message; then dequeue as on `turn_end` |
| `agent_start`, `tool_execution_*` | not bridged — tool telemetry comes from the `beforeToolCall`/`afterToolCall` hooks |

**Streaming.** `message_update` text/thinking deltas buffer per block type and flush as `agent.stream.chunk` `{ stream_id, seq, block_type, text }` at ≥ 64 chars or on a 200ms timer (a block-type change flushes the prior buffer first); the assistant `message_end` flushes the remainder and publishes `agent.stream.end` `{ stream_id, total_chunks }`.

**Tool telemetry hooks.** `beforeToolCall` publishes `agent.tool.call` `{ tool_call_id, name, input, input_truncated }`; `afterToolCall` publishes `agent.tool.result` `{ tool_call_id, name, output, output_truncated, duration_ms, error, details }`. `tool_call_id` is pi-agent's provider-defined id passed through as-is — the same string in both events is the correlation key for observers. `output` serializes the whole Jie `ToolResult` (content, details, terminate), not just the LLM-visible text, and `details` is additionally carried first-class in the payload. Both text fields are middle-truncated to 4 KiB (`EVENT_TEXT_TRUNCATION_BYTES`, marker `...[N chars truncated]...`) — events only; the LLM always sees untruncated tool input and output. Both events are observer-only: no agent subscribes to them.

### Agent Loop and Termination

A prompt drives one pi-agent run: think → optionally call tools → think → … until the LLM's `stopReason` is `stop`, `length`, `error`, or `aborted` (`toolUse` continues the loop). The platform adds no turn budgets and no grace turn: `notify` is a regular tool the LLM calls when its system prompt instructs it to, and `ToolResult.terminate` is handled natively by pi-agent (stop after the batch) without platform interpretation (ADR 6). Bodies process their own queues serially; pipeline seriality (one agent active per task) falls out of the team's subscription graph, not a platform mechanism. Error resolution is LLM reasoning over tool-result text — agents are not crash-and-restart components.

## Memory Integration

Two facts belong here; the full contract is canonical in `08-memory.md`.

- **Write-through persist.** Every pi-agent `message_end` → `memory.persist(...)` to SQLite, unconditionally (no role check, no buffering).
- **Session identity.** The `sessionId` is minted per process run × team by `createJiePlatform` and passed to the body (ADR 17); all agents of one team in one process share it. `jie --resume <id>` validates via `memory.hasSession` and fails hard with `unknown_session` on a miss. `restore()` on `start()` returns the prior rows for `(teamId, agentKey, sessionId)`; a fresh session restores empty.

The `transformContext` passed to pi-agent is identity in v1 — compaction, and the `memory.compact()` storage seam it drives, is not wired. See `08-memory.md` "Integration with pi-agent" for the Day-2 wrapper contract.

## Boundary Enforcement (Platform vs Team)

The platform's file tools — `read_file`, `write_file`, `edit`, and `bash`'s `workdir` — enforce **workspace-root containment only**: the resolved absolute path must stay inside the resolved workspace root, or a typed `path_escape` / `workdir_escape` error results. They do not enforce module boundaries, no-new-exports rules, or any team-defined constraint (ADR 9):

| Layer | Enforces | Status |
|---|---|---|
| Platform file tools | "inside the workspace root" | v1 |
| Team blueprint (role system prompt, or a wrapper tool the team defines) | "inside the allowed module boundary" | Day 2, team-owned |

Consequence: in v1 an agent with `write_file` can write any file inside the workspace root, including files in a sealed module. Preventing that is the team layer's contract, by design.
