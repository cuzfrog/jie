# Agent Model

## AgentSoul

A soul declares an agent's behavioral profile. Souls are defined by the team blueprint — the platform does not hardcode any specific roles.

```typescript
interface AgentSoul {
  role:                string;          // team-defined role identifier
  model:               string;          // '<provider>/<model>', e.g. 'anthropic/claude-sonnet-4'
  system_prompt:       SystemPrompt;    // assembled at load time
  tools:               ToolSpec[];      // defined by team blueprint
  subscriptions:       string[];        // event type strings the agent listens for
  publishes:           string[];        // event type strings the agent may emit via notify
}

interface SystemPrompt {
  identity:    string;          // who you are; from team blueprint
  tools_guide: string;          // how to use tools; from team blueprint
  constraints: string;          // hard rules; from team blueprint
  prose:       string;          // optional free-form system prompt extension
}
```

`ToolSpec` is a string in one of three shapes:

| Shape | Meaning |
|---|---|
| `tool_name` | A built-in tool. Resolved against the built-in tool registry. |
| `mcp:<server>:<method>` | A specific tool on an MCP server. At startup, the body connects to `<server>`, fetches the schema for `<method>`, and registers a first-class `Tool` whose `execute` dispatches over MCP. |
| `mcp:<server>:<glob>` | A glob over the server's tool names. At startup, the body connects to `<server>`, fetches the full catalog, and registers each matching tool as a first-class `Tool`. |

**Glob semantics** for the third shape:

- Two metacharacters: `*` matches any run of characters including the empty string; `?` matches exactly one character. No other characters carry special meaning.
- The pattern is **anchored** to the full tool name: the glob must match start to end.
- Matching is **case-sensitive**.
- A pattern containing no metacharacters is equivalent to `mcp:<server>:<method>` (single specific tool, must exist or startup fails).
- A pattern that matches zero tools is a startup failure.

The LLM sees every tool — built-in or MCP-backed — with its real schema in its tool list. There is no `use_mcp` meta-tool.

## Soul Loading

1. Load the team blueprint's static profile (`tools`, `subscriptions`, `publishes`, prompt fragments) for this role.
2. Resolve every entry in `tools`:
   - Built-in name → look up in registry.
   - `mcp:<server>:<method-or-glob>` → connect to `<server>` over MCP, fetch tool catalog, register matching tools.
3. **If any MCP server in the tool list is unreachable, the agent fails to start.** No degraded mode.
4. Schemas are not cached across team restarts; they are re-fetched every time.

## Tool

```typescript
interface Tool<TInput = unknown, TOutput = unknown> {
  name:        string;
  description: string;
  schema:      ZodSchema<TInput>;
  execute(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
}
```

Tools are plain typed functions. With one exception (the built-in `notify` tool, see below), tools have no awareness of the event bus. MCP-backed tools implement the same interface; the MCP call is an implementation detail of `execute`. Custom team-defined tools cannot publish events.

### Built-in Tool: `notify`

`notify` is a built-in tool registered automatically on every body. It is the LLM's sole means of publishing an event and is how an agent signals that its turn is complete.

```typescript
// Schema seen by the LLM — body enriches with context fields before publishing.
notify(input: { event_type: string; payload: Record<string, unknown> }): { ok: true }
```

Behavior inside the body:

1. Validate `event_type ∈ soul.publishes`. Otherwise return a tool-error: `not_in_publishes`.
2. Enrich the LLM-supplied payload with context fields (from `ExecutionContext`):
   - `work_id` — the current work-unit identifier.
   - Other team-defined context fields (e.g. `iteration`) as specified by the team blueprint.
3. Validate the enriched payload against the team-provided schema for `event_type`. Otherwise return a tool-error: `invalid_payload`.
4. Run the status guard (see Status Tracking below). On illegal transition, return a tool-error: `illegal_transition`.
5. On success, the body appends a new status row, publishes `session.{session_id}.{event_type}`, returns `{ ok: true }` to the LLM, and **ends the turn loop** for the current inbound event. Any subsequent LLM tool calls in the same response are dropped with a warning log.

`notify` is the only tool whose `execute` touches the bus, and even then only via the body that owns it.

### Built-in Tool: `bash`

`bash` executes shell commands within the workspace root.

```typescript
bash(input: { command: string; workdir?: string }): BashResult

interface BashResult {
  exit_code: number;
  stdout:    string;
  stderr:    string;
}
```

Rules:

- The command execs in the team's workspace root by default. `workdir`, if provided, is resolved relative to the workspace root. Path resolution uses `realpath`; the resolved absolute path must start with the resolved absolute workspace root path. Any `workdir` that resolves outside the workspace root results in a tool-error (`workdir_escape`).
- A fixed timeout (default 300s per invocation) kills the process and returns `exit_code = -1` with stderr: `"command timed out"`.
- The command runs with the workspace's environment (inherited from the agent process). No isolation sandbox beyond the workspace-root constraint in v1.
- Shell is `/bin/sh` (POSIX).
- Output (`stdout` + `stderr` combined) is truncated to 64 KiB; the tool returns a note when truncation occurred.
- Consecutive `bash` calls that consistently return non-zero exit codes are tool-result errors that decrement `error_turn_budget`.

### Built-in Tools: `web_search` and `web_fetch`

```typescript
web_search(input: { query: string; max_results?: number }): WebSearchResult[]
web_fetch(input: { url: string }): { content: string; truncated: boolean }
```

These are built-in tools in `packages/jie-platform/tools/`. They implement the `Tool` interface and are pluggable — the team blueprint may include or exclude them from specific roles.

## Tool Telemetry

Every tool call is observable on the event bus. The body emits two events per tool invocation:

- **`agent.tool.call`** — emitted **before** `tool.execute()`. Payload: `tool_call_id`, `name`, JSON-serialized `input`, `input_truncated`.
- **`agent.tool.result`** — emitted **after** `tool.execute()` returns (or throws). Payload: `tool_call_id`, `name`, JSON-serialized `output` (or `null` on throw), `output_truncated`, `duration_ms`, `error` (or `null`).

`tool_call_id` is a per-agent uint32 monotonic counter starting at 0.

Input and output are JSON-serialized. If the serialized string exceeds **4 KiB**, it is middle-truncated: the first and last `(4096 - MARKER_LEN) / 2` chars are preserved, with a marker `...[N chars truncated]...` in between.

Both events are **ephemeral** on JetStream. They are **observer-only** — no agent role subscribes to them. The TUI and diagnostic tooling consume them.

## AgentBody

```typescript
class AgentBody {
  readonly id:                 string;          // process instance id: {role}-{8-hex}
  readonly soul:               AgentSoul;       // immutable after construction
  readonly error_turn_budget:  number;          // per-loop error tolerance; default 30
  readonly total_turn_budget:  number;          // per-loop hard turn cap; default 200

  private bus:        EventBus;
  private artifacts:  ArtifactStore;
  private memory:     MemoryStore;              // see 08-memory.md

  start(): void {}    // subscribes to soul.subscriptions on bus, begins event loop
  stop(): void {}     // unsubscribes, shuts down cleanly
}
```

- No inheritance. `AgentBody` is the only concrete class.
- Soul is immutable. An agent's role cannot change at runtime.
- Compaction is owned by the `MemoryStore`, not by the body. See `08-memory.md`.
- The body is the **only** publisher of events on the bus. The LLM expresses publication intent through `notify`; the body validates and executes the publish.

### Event Loop and Explicit Emission

While running:

1. Receive event matching one of `soul.subscriptions` from NATS.
2. If currently processing a prior event, append to a bounded FIFO queue (cap 8). On overflow, the body **asserts and exits**: under a serial pipeline the queue should hold at most one event, so overflow is a bug. The supervisor restarts the body; durable domain events replay via JetStream. Drop-oldest is **not** an option.
3. When idle, dequeue the next event and process it.

Processing an event = one LLM-driven loop of (think → optionally call tools → think → ...) bounded by the budgets below. The LLM signals completion by calling `notify(event_type, payload)`. On a successful `notify`, the body publishes the event and the loop ends.

If the LLM ends its response (no further tool calls, no `notify`), the body grants exactly **one grace turn**: it sends a system-level reminder to the LLM ("your turn ended without calling `notify`; emit now or explain why you cannot") and resumes the loop. If the next response also ends without a successful `notify`, the body force-publishes a terminal event with `error = "missing_emission"`. The grace turn does not decrement `error_turn_budget` but does decrement `total_turn_budget` by one.

### Status Tracking

Per-work-unit progress is recorded in the artifact store via `append_status` and `read_status`. The team blueprint defines the status schema, the allowed transitions, and which role is permitted to advance to which status.

The artifact store exposes status rows as an append-only log. The latest row per `work_id` (by `created_at`) is canonical.

When the LLM calls `notify`, the body:

- Reads the current status via `read_status(work_id)`.
- Validates the requested transition against the team-provided transition table.
- On legal transition: appends a new status row via `append_status` and publishes the event.
- On illegal transition: the append is **not** performed and `notify` returns a tool-error (`illegal_transition`). The LLM may retry with a different `event_type`.

The team blueprint defines which statuses are terminal (work unit complete, no re-entry) and which are re-enterable.

### Concurrency Model

Pipeline seriality is defined by the team blueprint's subscription graph. Under a linear pipeline (each role subscribes to the previous role's emission), only one agent is processing at a time per work unit. There is no team-wide distributed latch.

### Failure Handling

Agents resolve errors using LLM reasoning; they are not crash-and-restart components. Two **fixed budgets**, scoped to one event-handling loop, bound runaway behavior:

- **`error_turn_budget`** (default 30, per-body). Decrements by one on every turn that consumes at least one tool-result error. Pure-thinking and all-success turns do not decrement it. When it hits zero, the body force-publishes a terminal event with `error = "error_budget_exhausted"`.
- **`total_turn_budget`** (default 200, per-body). Decrements by one on every LLM turn unconditionally. Safety net against pathological loops. When it hits zero, the body force-publishes a terminal event with `error = "turn_budget_exhausted"`.

Tool errors are returned to the LLM as tool-result messages in the same conversation; the LLM may try a different approach.

**MCP server crash mid-session.** If an MCP server becomes unreachable while a tool call is in flight, the tool returns a fatal error (`mcp_server_unreachable`). The body treats this as unrecoverable: it logs the server and tool name, force-publishes a terminal event with `error = "mcp_server_unreachable:{server}"`, and exits. No retry, no reconnect. The supervisor restarts the agent.

**NATS disconnect** is handled the same way: the body force-publishes a terminal event with `error = "nats_disconnect"` and exits. The supervisor restarts the process.

## ExecutionContext

Passed to every tool call. Provides identifiers and storage; **does not** expose the event bus.

```typescript
interface ExecutionContext {
  session_id:  string;
  work_id:     string;        // team-defined work-unit identifier
  agent_id:    string;
  agent_role:  string;
  artifacts:   ArtifactStore;
}
```
