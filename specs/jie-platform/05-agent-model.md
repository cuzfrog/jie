# Agent Model

## AgentSoul

A soul declares an agent's behavioral profile. Souls are derived from the team blueprint at startup — the platform parses declarative config and constructs souls from it. No roles are hardcoded.

```typescript
interface AgentSoul {
  role:            string;      // agent identifier (filename stem from TEAM.md directory)
  model:           string;      // '<provider>/<model>', resolved via @earendil-works/pi-ai's getModel()
  system_prompt:   string;      // prose body of the agent's .md file
  tools:           ToolSpec[];  // from frontmatter `tools`, resolved through ToolRegistry
  notify:          string[];    // from frontmatter `notify` — event_type values this agent may emit
  subscriptions:   string[];    // auto-computed by platform (agent does not declare this)
}
```

Agents have no knowledge of the event bus and no domain-event subscriptions. They receive prompts and use tools. The leader agent is the sole exception — the platform auto-subscribes it to `session.*.>` and `team.{team_id}.prompt` so it can track pipeline progress and accept user input. Non-leader agents subscribe only to `team.{team_id}.prompt.{role}` for ingress via `delegate`.

The `system_prompt` is the markdown prose from the agent's `.md` file, verbatim. No fragmentation into identity/tools_guide/constraints/prose — it's one block the LLM sees as its system message.

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

### ToolRegistry

Central catalog of all tools available to agents. The platform feeds it — built-in tools at startup, MCP server tools on connection. The registry is storage-agnostic: a `Tool` is a `Tool`, regardless of whether its `execute` implementation delegates over MCP or does local work.

```typescript
interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];    // glob-expands mcp:server:*; specific spec returns one
  list(): Tool[];
}
```

- `register` — adds a tool. Duplicate names replace the prior entry (last writer wins).
- `resolve` — matches the spec string against registered tool names using anchored shell-style glob (`*`, `?`). Returns matched `Tool` instances. A specific name returns `[Tool]`. A glob returns zero-or-more; zero matches signals "nothing resolved" (the caller decides whether that is a startup failure).
- `list` — returns all registered tools for introspection.

## Blueprint Loading

The team blueprint lives at `.jie/teams/<team_name>/`:

```
.jie/teams/default/
  TEAM.md              # frontmatter: leader
  dm.md                # agent files — filename is role name
  researcher.md
  architect.md
  planner.md
  implementer.md
  reviewer.md
```

### TEAM.md

Minimal wiring — just declares the leader role:

```yaml
---
leader: dm
---
```

All `.md` files in the directory besides `TEAM.md` are agent definitions. Filename (stem) is the role identifier.

### Agent .md

Frontmatter declares the mechanical surface; prose body is the system prompt:

```yaml
---
model: anthropic/claude-sonnet-4
tools:
  - web_search
  - web_fetch
  - write_artifact
  - read_artifact
notify:
  - task.researched
---
```

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `model` | yes | `<provider>/<model>` string, resolved via `@earendil-works/pi-ai` |
| `tools` | yes | list of tool spec strings. Resolved through `ToolRegistry` at load time. |
| `notify` | yes | list of `event_type` values this agent is permitted to emit via `notify`. May be empty. |

**Prose body** → `AgentSoul.system_prompt`. Provided to the LLM as the system message.

### Platform Auto-Wiring

After parsing, the platform constructs `AgentSoul` instances with the following subscriptions determined by role, not declared in config:

| Agent | Auto-subscriptions |
|---|---|
| Leader | `team.{team_id}.prompt`, `session.*.>` |
| All other agents | `team.{team_id}.prompt.{role}` |

The leader is the only agent subscribed to domain events. Pipeline progress tracking is the leader's responsibility, driven by its system prompt prose (which describes the workflow). Other agents wake up only when the leader delegates to them.

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

`notify` is auto-registered on every agent body. It is the LLM's sole means of publishing an event and is how an agent signals that its turn is complete.

```typescript
notify(input: { event_type: string; payload: Record<string, unknown> }): { ok: true }
```

Behavior inside the body:

1. Validate `event_type ∈ soul.notify`. Otherwise return a tool-error: `not_in_notify_list`.
2. Enrich the LLM-supplied payload with context fields (from `ExecutionContext`): `work_id`, `session_id`.
3. Append a status row via `artifact_store.append_status(work_id, event_type, payload)`.
4. Publish `session.{session_id}.{event_type}` on the event bus.
5. Return `{ ok: true }` to the LLM and **end the turn loop** for the current inbound event. Any subsequent LLM tool calls in the same response are dropped with a warning log.

No transition validation in v1 — status rows are append-only with the latest row per `work_id` as canonical state. The leader agent interprets status progression (via its system prompt).

### Built-in Tool: `delegate`

Auto-registered on the **leader only**. The leader uses `delegate` to hand work to another agent.

```typescript
delegate(input: { prompt: string; role: string; work_id?: string }): void
```

The body publishes a `PromptMessage` envelope to `team.{team_id}.prompt.{role}`. The target agent's body receives it, injects it as a prompt turn into the LLM context, and begins its event loop. `delegate` is fire-and-forget — it does not block on the target agent's completion. The leader tracks completion by receiving the target agent's `notify` event via its `session.*.>` subscription.

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

Both events are **ephemeral** (NATS core pub/sub). They are **observer-only** — no agent subscribes to them. The TUI and diagnostic tooling consume them.

## AgentBody

```typescript
class AgentBody {
  readonly id:                 string;          // process instance id: {role}-{8-hex}
  readonly soul:               AgentSoul;       // immutable after construction
  readonly is_leader:          boolean;         // true if this role is the TEAM.md leader
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

### Event Loop

Agents wake up on a prompt — either a user prompt (leader only) or a delegated prompt from the leader (non-leader agents).

While running:

1. Receive a `PromptMessage` from the agent's prompt ingress subject (`team.{team_id}.prompt` or `team.{team_id}.prompt.{role}`).
2. If currently processing a prior prompt, append to a bounded FIFO queue (cap 8). On overflow, the body **asserts and exits**. The supervisor restarts the body.
3. When idle, dequeue the next prompt and process it.

Processing a prompt = one LLM-driven loop of (think → optionally call tools → think → ...) bounded by the budgets below. The LLM signals completion by calling `notify(event_type, payload)`. On a successful `notify`, the body publishes the event and the loop ends.

If the LLM ends its response (no further tool calls, no `notify`), the body grants exactly **one grace turn**: it sends a system-level reminder to the LLM ("your turn ended without calling `notify`; emit now or explain why you cannot") and resumes the loop. If the next response also ends without a successful `notify`, the body force-publishes a terminal event with `error = "missing_emission"`. The grace turn does not decrement `error_turn_budget` but does decrement `total_turn_budget` by one.

### Concurrency Model

Pipeline seriality is enforced by the leader: it delegates one agent at a time and waits for that agent's `notify` event before delegating the next. There is no distributed latch — the leader's own event loop is the gate. The leader's system prompt describes the pipeline order.

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
