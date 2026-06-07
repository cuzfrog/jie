# Agent Model

## AgentSoul

A soul declares an agent's behavioral profile. Souls are derived from the team blueprint at startup — the platform parses declarative config and constructs souls from it. No roles are hardcoded.

```typescript
interface AgentSoul {
  role:            string;      // agent identifier (filename stem from TEAM.md directory)
  model:           string;      // '<provider>/<model_id>', split on first '/', resolved via pi-ai's getModel(provider, modelId)
  system_prompt:   string;      // prose body of the agent's .md file
  tools:           ToolSpec[];  // from frontmatter `tools`, resolved through ToolRegistry
  subscribe:       string[];    // from frontmatter `subscribe` — topic names this agent listens to
  subscriptions:   string[];    // auto-computed by platform (agent does not declare this)
}
```

Agents communicate exclusively through `notify` (publishing to topics) and subscription-based ingress. They have no direct references to other agents.

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
  TEAM.md              # frontmatter: leader, optional per-role instances
  leader.md            # agent files — filename (stem) is the role identifier
  worker_a.md
  worker_b.md
```
  
The built-in dev team (`jie-team`) provides a concrete blueprint with 6 roles (DM, Researcher, Architect, Planner, Implementer, Reviewer). See `jie-team/01-role-definitions.md`.

### TEAM.md

Minimal wiring — declares the leader role and optional per-role instance counts:

```yaml
---
leader: leader
# Day 2 — multi-instance roles. v1: every role has exactly 1 instance.
# instances:
#   worker_a: 1
#   worker_b: 2
---
```

All `.md` files in the directory besides `TEAM.md` are agent definitions. Filename (stem) is the role identifier. Each role maps to a persistent `agent_key = {role}-{N}`. In v1 with one instance per role, keys are `{role}-1` (e.g. `leader-1`, `worker_a-1`). Multi-instance roles (`N > 1`) are deferred to Day 2.

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
subscribe:
  - task.recorded
---

# System Prompt

You are a researcher agent. Your job is...

When you finish, call `notify('task.researched', '...')` to signal completion.
```

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `model` | no | `<provider>/<model_id>` string. Split on first `/` → `getModel(provider, modelId)` via pi-ai. If absent, inherited from the user's global default at startup (see `10-configuration.md` "Model Resolution"). |
| `tools` | yes | list of tool spec strings. Resolved through `ToolRegistry` at load time. |
| `subscribe` | yes | list of topic strings this agent listens to. May be empty. |

**Prose body** → `AgentSoul.system_prompt`. Provided to the LLM as the system message.

### Model Resolution

The `model:` field is optional. When absent, the platform falls through to the user's global default — see `10-configuration.md` "Model Resolution" for the full chain. The `AgentSoul.model` value is always a resolved `<provider>/<modelId>` string by the time the soul is constructed; the frontmatter field is just the agent's *explicit override* slot.

If a model string is present but malformed (no `/` separator), the platform fails at startup with `invalid model string: <value>` citing the agent's role. The error is part of the supervisor's pre-check (see "Startup Pre-Check" below).

### Startup Pre-Check

The supervisor walks every agent in the blueprint before constructing any `AgentSoul`. For each agent it attempts to resolve a concrete `(provider, modelId)`. If any agent fails, startup exits 1 with a single error message listing every unresolved agent:

```
model resolution failed for 2 agents:
  - leader: no default model configured
  - researcher: no default model configured

Set a global default with `jie model <provider>/<modelId>` (writes ~/.jie/settings.json),
or add `model: <provider>/<id>` to each agent's .md frontmatter.
```

This is a hard fail — no partial startup, no agent constructed. The supervisor does not surface a "missing model" error at LLM-call time; that class of error is caught here.

### Platform Auto-Wiring

After parsing, the platform constructs `AgentSoul` instances with auto-computed subscriptions. Every agent auto-subscribes to its own `{agent_key}` for direct addressing. The leader additionally auto-subscribes to `leader.prompt` for user input.

| Subscription | Who gets it |
|---|---|
| `{agent_key}` | Every agent (auto, based on role name and instance N) |
| `leader.prompt` | Leader only (auto, based on `TEAM.md` `leader` field) |
| Domain topics from `subscribe:` | Per agent `.md` frontmatter |

No other auto-subscriptions. The leader has no special tools or subscriptions beyond what other agents have.

## Tool

Jie tools use TypeBox schemas (matching `@earendil-works/pi-ai`'s type system). At AgentBody construction, each Jie `Tool` is adapted into pi-agent's `AgentTool` interface.

```typescript
interface Tool<TInput = any> {
  name:        string;
  description: string;
  label:       string;                          // human-readable name for UI / telemetry
  timeout?:    number;                          // per-invocation timeout in ms (default 120_000)
  parameters:  TSchema;                         // TypeBox schema — defines LLM-visible tool schema
  execute(input: TInput, ctx: ExecutionContext, signal?: AbortSignal): Promise<ToolResult>;
}
```

```typescript
interface ToolResult {
  content:   string;          // text returned to the LLM conversation
  details?:  unknown;         // structured details for afterToolCall hooks
  terminate?: boolean;        // hint: stop LLM loop after this tool batch (optional)
}
```

Tools are plain typed functions. With one exception (the built-in `notify` tool, see below), tools have no awareness of the event bus. MCP-backed tools implement the same interface; the MCP call is an implementation detail of `execute`. Custom team-defined tools cannot publish events.

**Timeout.** Every tool call has a default timeout of **120 seconds**. The adaptation layer combines any pi-agent-provided `signal` with `AbortSignal.timeout(tool.timeout ?? 120_000)`. Tools receive the combined `signal` and should abort when it fires. Individual tools may override the default (e.g. `bash` uses 300s). MCP tools inherit the 120s default.

### Tool Adaptation to pi-agent

At `AgentBody` construction, each Jie `Tool` is wrapped into pi-agent's `AgentTool`:

| pi-agent field | Jie source |
|---|---|
| `name` | `Tool.name` |
| `description` | `Tool.description` |
| `label` | `Tool.label` |
| `parameters` | `Tool.parameters` (TypeBox, passed directly) |
| `prepareArguments` | TypeBox `Value.Create(parameters)` + `Value.Validate(parameters, raw)` — shims raw LLM args to typed params before validation |
| `execute(toolCallId, params, signal?, onUpdate?)` | Calls `tool.execute(params, ctx)` → wraps return as `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate }`. Passes `onUpdate` through for tools that stream partial results. |
| `executionMode` | Always `"sequential"` in v1 (parallel tool execution deferred to Day 2) |

Most built-in tools return synchronous results and ignore `onUpdate`. Tools like `bash` may use `onUpdate` for live stdout streaming.

### Built-in Tool: `notify`

`notify` is auto-registered on every agent body. It is the LLM's sole means of publishing an event to another agent or to a domain topic.

```typescript
notify(input: { topic: string; prompt: string }): { ok: true; recipients: number }
```

Behavior inside the body:

1. Publish `{ topic, prompt, source: this.agent_key }` to `{topic}` on the event bus.
2. The event bus filters self-receipt: the publishing agent does not receive its own notification, even if subscribed to the topic.
3. Return `{ ok: true, recipients: <subscriber count> }` to the LLM. If `recipients === 0`, the LLM can react to the undelivered notification.
4. The LLM continues processing — `notify` does **not** end the turn loop.

On receipt, an agent formats the notification as a synthetic `user` message in the LLM conversation: `[{source_agent_key} on '{topic}']: {prompt}`.

The built-in team blueprint uses domain topics for pipeline progression. Prose examples use shorthand `notify('topic', 'prompt')` for readability; the actual LLM call follows the TypeBox schema: `notify({ topic: string, prompt: string })`.

### Built-in Tool: `bash`

`bash` executes shell commands within the workspace root.

```typescript
bash(input: { command: string; workdir?: string }): BashResult

interface BashResult {
  exit_code: number;
  stdout:    string;
  stderr:    string;
  truncated: { stdout: boolean; stderr: boolean };
}
```

Rules:

- The command execs in the team's workspace root by default. `workdir`, if provided, is resolved relative to the workspace root. Path resolution uses `realpath`; the resolved absolute path must start with the resolved absolute workspace root path. Any `workdir` that resolves outside the workspace root results in a tool-error (`workdir_escape`).
- A fixed timeout (default 300s per invocation) kills the process and returns a tool error (`command_timed_out`). The agent sees this as a failed tool invocation.
- The command runs with the workspace's environment (inherited from the agent process). No isolation sandbox beyond the workspace-root constraint in v1.
- Shell is `/bin/sh` (POSIX).
- Output: `stdout` and `stderr` are each independently truncated to **32 KiB**. The `truncated` field reports which streams were clipped. A truncated stream has a marker `[truncated to 32 KiB]` appended at the point of truncation.

### Built-in Tools: `web_search` and `web_fetch`

```typescript
web_search(input: { query: string; max_results?: number }): WebSearchResult[]

interface WebSearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

web_fetch(input: { url: string }): { content: string; truncated: boolean }
```

These are built-in tools in `packages/jie-platform/tools/`. They implement the `Tool` interface and are pluggable — the team blueprint may include or exclude them from specific roles.

#### `web_search` Backend

The `web_search` tool delegates to a `WebSearchProvider` implementation. The default provider scrapes DuckDuckGo HTML (`https://html.duckduckgo.com/html/`) — no API key required, works out of the box. The provider interface is narrow so alternative backends (Brave, Tavily, self-hosted SearXNG) can be plugged in later.

```typescript
interface WebSearchProvider {
  search(query: string, max_results: number): Promise<WebSearchResult[]>;
}
```

The platform registers one provider at startup. The `web_search` tool calls the registered provider and returns its results as-is. v1 ships only the DuckDuckGo adapter; alternative providers are a Day 2 concern.

#### `web_fetch` HTTP Client Policy

| Policy | Value |
|---|---|
| URL schemes | `http`, `https` only. Other schemes (e.g. `file:`, `ftp:`, `data:`) are rejected with a tool error. |
| Redirects | Follow up to 5 hops. |
| Max response body | 5 MiB. Larger responses are truncated at 5 MiB and `truncated: true` is set. |
| TLS | Validation enabled. Self-signed certs are not accepted in v1. |
| User-Agent | `JieBot/0.1 (+https://github.com/cuzfrog/jie)` |
| Timeout | Inherits the tool's 120s default. |
| Encoding | UTF-8 default; if `Content-Type` declares a charset, that charset is used. |
| Content conversion | HTML is stripped to plain text — script/style/nav/header/footer tags removed, remaining text extracted. Non-HTML responses (e.g. `text/plain`, `application/json`, `application/xml`) are returned verbatim. |

The return type is `{ content: string; truncated: boolean }` — the interface is **format-agnostic**. The `content` field carries whatever text the adapter produces; the tool contract is just "give the LLM the text and tell it if you had to cut it off."

### Built-in Tools: `write_artifact` and `read_artifact`

Wrappers over the `ArtifactStore` interface (see `04-artifact-store.md`):

```typescript
write_artifact(input: { key: string; content: string }): { key: string; created_at: string }
read_artifact(input: { key: string }): { key: string; content: string; created_at: string } | null
```

- `write_artifact` — stores `content` at `key`. Overwrites if the key exists. Returns the canonical `{ key, created_at }` so the LLM can reference the artifact in subsequent event payloads. On storage failure (e.g. disk full, permission denied), the call surfaces a tool error.
- `read_artifact` — returns the entry at `key`, or `null` if not found. A missing artifact is a normal result, not a tool error — the LLM can reason about it.

These are the only two artifact tools exposed to agents. Artifact content is never passed in event payloads; events carry only `artifact_id`.

## Tool Telemetry

Every tool call is observable on Jie's event bus. The body wires pi-agent's `beforeToolCall` and `afterToolCall` hooks to emit:

- **`agent.tool.call`** — emitted in `beforeToolCall` (before tool execution). Payload: `tool_call_id`, `name`, JSON-serialized `input`, `input_truncated`.
- **`agent.tool.result`** — emitted in `afterToolCall` (after execution completes or throws). Payload: `tool_call_id`, `name`, JSON-serialized `output` (or `null` on throw), `output_truncated`, `duration_ms`, `error` (or `null`).

`tool_call_id` is pi-agent's per-invocation string. Jie publishes its own monotonic `uint32` counter for the event bus payload (starts at 0 per agent).

Input and output are JSON-serialized. If the serialized string exceeds **4 KiB**, it is middle-truncated: the first and last `(4096 - MARKER_LEN) / 2` chars are preserved, with a marker `...[N chars truncated]...` in between.

Both events are **ephemeral** (NATS core pub/sub). They are **observer-only** — no agent subscribes to them. The TUI and diagnostic tooling consume them.

## AgentBody

`AgentBody` wraps pi-agent's `Agent` class. It owns the EventBus bridge, tool adaptation, memory persistence, and lifecycle coordination.

```typescript
class AgentBody {
  readonly agent_key:          string;          // persistent instance identity: {role}-{N}
  readonly soul:               AgentSoul;       // immutable after construction
  readonly is_leader:          boolean;         // true if this role is the TEAM.md leader

  private agent:   Agent;                       // pi-agent-core's Agent instance
  private bus:     EventBus;
  private artifacts: ArtifactStore;
  private memory:  MemoryManager;               // see 08-memory.md

  start(): void {}    // subscribes to soul.subscriptions on bus, begins event loop
  stop(): void {}     // unsubscribes, shuts down cleanly
}
```

- No inheritance. `AgentBody` is the only concrete class.
- Soul is immutable. An agent's role cannot change at runtime.
- pi-agent's `Agent` handles the LLM loop, tool execution, streaming, and compaction.
- The body is the **only** publisher of events on Jie's bus. The LLM expresses publication intent through `notify`; the body validates and executes the publish.

### Event Loop

Agents wake up on a prompt — either a user prompt (leader via `leader.prompt`) or a topic notification from another agent (via `notify` to a topic the agent subscribes to).

While running:

1. Receive a message on a subscribed subject (e.g. `leader.prompt` or a domain topic like `task.recorded`).
2. If currently processing a prior message, the incoming message waits until the agent is idle.
3. When idle, pick up the next message and process it.

Processing a prompt = one LLM-driven loop managed by pi-agent's `Agent`. The loop runs (think → optionally call tools → think → ...) until the LLM's `stopReason` is `"stop"`, `"length"`, `"error"`, or `"aborted"`. The LLM calls `notify(topic, prompt)` when the system prompt instructs it to — `notify` is a regular tool, not a loop-control mechanism. See pi-agent Integration Contract for loop termination details.

### Concurrency Model

Agents are independent — they process their own message queue serially. Pipeline seriality (one agent at a time) is enforced by the team blueprint's topic subscription graph: each role subscribes to the previous role's topic, so under normal operation only one agent processes at a time per task.

The leader enforces a single-task-in-flight invariant via its system prompt — it does not emit `task.recorded` for a new task while a previous task is active. This is team-defined behavior, not a platform mechanism.

### Failure Handling

Agents resolve errors using LLM reasoning; they are not crash-and-restart components. Tool errors are returned to the LLM as tool-result messages in the same conversation; the LLM may try a different approach.

**Loop termination.** pi-agent's loop terminates when the LLM returns `stopReason: "stop"` (natural end), `"length"` (token limit), `"error"`, or `"aborted"`. Jie does not add its own termination logic on top of pi-agent's loop. `ToolResult.terminate` is a pi-agent mechanism — if a tool returns `terminate: true`, pi-agent stops executing remaining tools in the batch and exits the inner loop. Jie tools may set `terminate: true` but this is pi-agent's concern, not Jie's.

**MCP server crash mid-session.** If an MCP server becomes unreachable while a tool call is in flight, the in-flight call times out (per the default 120s timeout) or returns `mcp_server_unreachable`. The error surfaces to the LLM as a tool-result error — the agent handles it like any other tool error and may retry or degrade gracefully. No process exit. Subsequent MCP calls to the same server return errors until the server is reconnected.

**Bus disconnect.** The in-process `EventBus` cannot disconnect (it's a local data structure). When the process exits, the supervisor detects the child exit and restarts it.

## ExecutionContext

Passed to every tool call. Provides identifiers and storage; **does not** expose the event bus.

```typescript
interface ExecutionContext {
  session_id:  string;        // per-process-run identifier; shared across agents in the same process
  agent_key:   string;        // persistent instance identity: {role}-{N}
  agent_role:  string;
  artifacts:   ArtifactStore;
}

## pi-agent Integration Contract

`AgentBody` wraps pi-agent's `Agent` class. This section defines the exact interface boundary: what Jie provides to pi-agent, what pi-agent provides to Jie, and how events flow between them. For the full pi-agent API surface, see `pi-agent-api-reference.md`.

### Agent Construction

At `AgentBody` construction, Jie instantiates pi-agent's `Agent` with the following `AgentOptions`:

| Option | Jie provides |
|---|---|
| `sessionId` | Jie's `session_id` (per-process-run ULID) |
| `getApiKey(provider)` | Resolves via pi-ai's `getEnvApiKey(provider)` — same env vars as `10-configuration.md` |
| `tools` | Set via `agent.state.tools` after construction (see Tool Adaptation below) |
| `systemPrompt` | Set via `agent.state.systemPrompt` — `AgentSoul.system_prompt` |
| `model` | Set via `agent.state.model` — resolved from soul's `model` string via pi-ai's `getModel(provider, modelId)` |
| `beforeToolCall` | Emits `agent.tool.call` on Jie's EventBus; can block execution |
| `afterToolCall` | Emits `agent.tool.result` on Jie's EventBus |
| `transformContext` | See Memory Persistence below |
| `convertToLlm` | pi-agent's default — converts `AgentMessage[]` to LLM `Message[]`, filtering non-LLM messages |
| `prepareNextTurn` | Checks Jie's EventBus for queued prompts/notifications; returns next prompt as `AgentLoopTurnUpdate` |
| `compactionSettings` | `CompactionSettings { enabled: false, reserveTokens: 16384, keepRecentTokens: 20000 }` (compaction deferred to Day 2) |
| `steeringMode` | Always `"all"` in v1 |
| `toolExecution` | Always `"sequential"` in v1 |

After construction, Jie sets `agent.state.tools` to the adapted `AgentTool[]`. Jie does NOT set `thinkingLevel` — agents use the model default unless the agent `.md` specifies otherwise (Day 2).

### Tool Adaptation

At construction time, each Jie `Tool` from `AgentSoul.tools` is wrapped into pi-agent's `AgentTool`:

| pi-agent `AgentTool` field | Adaptation |
|---|---|
| `name`, `description`, `label` | Copied directly from Jie `Tool` |
| `parameters` | Jie `Tool.parameters` (TypeBox `TSchema`), passed directly |
| `prepareArguments(raw)` | `TypeBox.Value.Create(parameters, raw)` — coerces defaults, then `TypeBox.Value.Validate(parameters, result)` — validates. Throws on validation failure; pi-agent surfaces it as a tool error to the LLM. |
| `execute(toolCallId, params, signal?, onUpdate?)` | Combines `signal` with `AbortSignal.timeout(tool.timeout ?? 120_000)`: if pi-agent provides a signal, uses `AbortSignal.any([piSignal, AbortSignal.timeout(timeout)])`; if pi-agent signal is undefined, uses `AbortSignal.timeout(timeout)` alone. Calls `tool.execute(params, ctx, combinedSignal)`. Wraps return value: `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate ?? false }`. On throw (including `AbortError`), re-throws; pi-agent marks the result as `isError`. |
| `executionMode` | Always `"sequential"` |

`ExecutionContext` is closed over at adaptation time — `session_id`, `agent_key`, `agent_role`, and `artifacts` are bound once. Tools never receive different execution contexts within the same agent's lifetime.

### Event Bridging

pi-agent emits events via `agent.subscribe(listener)`. Jie subscribes to these and bridges them to its EventBus:

| pi-agent event | Jie EventBus subject | Notes |
|---|---|---|
| `agent_start` | — | Internal lifecycle; not published |
| `agent_end({ messages })` | — | Marks LLM loop completion; body then publishes `agent.idle` |
| `message_end({ message })` | — | Triggers `memory.persist(message, agent_key, session_id)` |
| `message_update({ message, assistantMessageEvent })` | `agent.stream.chunk` | Buffered: flush at 64 chars or 200ms (see below) |
| `message_start({ message })` | — | Streaming bookkeeping; no bus event |
| `turn_start` | — | Internal turn tracking |
| `turn_end({ message, toolResults })` | — | Turn bookkeeping. pi-agent decides loop continuation based on `message.stopReason` and `ToolResult.terminate`. |
| `tool_execution_start` | — | Deferred to Day 2 (currently `beforeToolCall` covers this) |
| `tool_execution_end` | — | Deferred to Day 2 (currently `afterToolCall` covers this) |

Jie uses `turn_end` for turn bookkeeping only. Loop continuation is pi-agent's responsibility: it checks `message.stopReason` (if `"toolUse"`, loop continues; otherwise exits) and `ToolResult.terminate` (if all tools in batch returned `terminate: true`, loop exits).

### Streaming Pipeline

pi-agent emits `message_update` on every token delta (text/thinking/tool_call content). Jie buffers these:

1. On first `message_update` of a new stream, allocate a new buffer, `stream_id` (per-LLM-invocation counter), and start a flush timer (`setTimeout`, `stream_flush_ms` default 200ms).
2. Append delta text to the buffer.
3. Flush when: buffer length ≥ `stream_chunk_size` (default 64 chars), or the flush timer fires (200ms since first buffered char). On flush, publish `agent.stream.chunk` with `{ stream_id, seq, text }`, reset the buffer, and clear the timer.
4. On `message_end` (assistant response complete), clear the timer, flush remaining buffer as final chunk, and publish `agent.stream.end` with `{ stream_id, total_chunks }`.

Streaming events are published on Jie's EventBus; the TUI and `-p` mode consume them.

### Prompt Ingress & Queuing

When a message arrives on Jie's EventBus (via `leader.prompt` or a topic subscription), the body:

1. If idle — formats the message as a synthetic `user` `AgentMessage`, calls `agent.prompt(message)`.
2. If busy — queues the message in `AgentBody`'s in-memory queue. After `agent_end`, the body checks the queue and calls `agent.prompt(nextMessage)`.

The queue is FIFO, in-memory only (not persisted). Lost on restart. See `08-memory.md` Leader Agent Working Memory.

> **v1 has no cap** on this queue (it is intentionally unbounded, matching pi-agent's `followUpQueue` / `steeringQueue` behavior). A backlog item exists to revisit cap value, drop policy, and observability — see `backlog.md` #19.

### Memory Persistence

On `message_end`, the body calls `memory.persist(message, agent_key, session_id)` — write-through to SQLite.

Memory is durable but session-scoped: a new process run gets a new `session_id`, so agents start with clean conversations each time. Memory restore is used only for debugging or future compaction-aware replay.

pi-agent's `transformContext` hook is wired but passive in v1: Jie's default `transformContext` is the identity function (no-op). Automatic compaction via pi-agent's `CompactionSettings` is deferred to Day 2 — the defaults are configured but not activated (`enabled: false` for v1). When enabled, `memory.compact()` records compaction summaries.

### Loop Termination

pi-agent's `Agent` loop terminates based on the LLM's `stopReason` field on `AssistantMessage`:
- `"stop"` — LLM finished naturally (no more to say, no tool calls). Loop exits.
- `"length"` — LLM hit max output tokens. Loop exits.
- `"toolUse"` — LLM requested tool calls. Loop continues after tool execution.
- `"error"` / `"aborted"` — API error or abort. Loop exits immediately.

Jie does not add grace turns or platform-level termination logic. The LLM is trusted to call `notify` per its system prompt. `ToolResult.terminate` is pi-agent's mechanism for a tool to signal "stop after this batch" — it is not Jie's concern.
```
