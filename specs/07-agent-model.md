# Agent Model

## AgentSoul

A soul declares an agent's behavioral profile. Built-in role souls live in `packages/agents/{role}.md` as plain markdown with YAML frontmatter. The frontmatter holds a small number of tunables; the markdown body is the agent's prose system prompt.

For built-in roles, `tools`, `subscriptions`, `publishes`, and the structured parts of `system_prompt` (identity, tools_guide, constraints) are **defined in `packages/agents/`** — they are not hardcoded in `core`. Frontmatter does not override them. Turn budgets (`error_turn_budget`, `total_turn_budget`) are body-level concerns (see `AgentBody`), not soul-level.

```typescript
interface AgentSoul {
  role:                AgentRole;     // 'dm' | 'architect' | 'researcher' | 'planner' | 'implementer' | 'reviewer'
  model:               string;        // '<provider>/<model>', e.g. 'anthropic/claude-sonnet-4'
  system_prompt:       SystemPrompt;  // assembled at load time
  tools:               ToolSpec[];    // loaded from role definition in packages/agents/
  subscriptions:       EventType[];   // loaded from role definition in packages/agents/
  publishes:           EventType[];   // loaded from role definition in packages/agents/
}

interface SystemPrompt {
  identity:    string;          // who you are; from core role registry
  tools_guide: string;          // how to use tools; from core role registry
  constraints: string;          // hard rules; from core role registry
  prose:       string;          // the markdown body of the agent's .md file
}
```

`ToolSpec` is a string in one of three shapes:

| Shape | Meaning |
|---|---|
| `read_file` | A built-in tool. Resolved against the built-in tool registry in `core`. |
| `mcp:<server>:<method>` | A specific tool on an MCP server. At startup, `core` connects to `<server>`, fetches the schema for `<method>`, and registers a first-class `Tool` whose `execute` dispatches over MCP. |
| `mcp:<server>:<glob>` | A glob over the server's tool names. At startup, `core` connects to `<server>`, fetches the full catalog, and registers each matching tool as a first-class `Tool`. Use for servers we don't fully control (e.g. `mcp:github:*`). |

**Glob semantics** for the third shape:

- Two metacharacters: `*` matches any run of characters including the empty string; `?` matches exactly one character. No other characters carry special meaning (no character classes, no anchors, no escaping — tool names are flat snake_case ASCII).
- The pattern is **anchored** to the full tool name: the glob must match start to end. `create_*` matches `create_issue` and `create_` but not `pre_create_issue`.
- Matching is **case-sensitive**.
- A pattern containing no metacharacters is equivalent to `mcp:<server>:<method>` (single specific tool, must exist or startup fails).
- A pattern that matches zero tools is a startup failure: the soul declared an expectation the server didn't satisfy.

The LLM sees every tool — built-in or MCP-backed — with its real schema in its tool list. There is no `use_mcp` meta-tool. The MCP-ness of a tool is invisible to both the soul author and the LLM.

User-defined custom agents follow a different schema; see the **Custom Agents** chapter (TBD).

## Soul Loading

For a built-in role:

1. Load the role's static profile (`tools`, `subscriptions`, `publishes`, prompt fragments) from `packages/agents/{role}/`.
2. Parse `agents/{role}.md` for YAML frontmatter (`model`) and markdown body (`system_prompt.prose`).
3. If `agents/{role}.md` does not exist, use defaults defined in the role profile.
4. Resolve every entry in `tools`:
   - Built-in name → look up in registry.
   - `mcp:<server>:<method-or-glob>` → connect to `<server>` over MCP, fetch tool catalog, register matching tools.
5. **If any MCP server in the tool list is unreachable, the agent fails to start.** No degraded mode.
6. Schemas are not cached across team restarts; they are re-fetched every time.

## Tool

```typescript
interface Tool<TInput = unknown, TOutput = unknown> {
  name:        string;
  description: string;
  schema:      ZodSchema<TInput>;
  execute(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
}
```

Tools are plain typed functions. With one exception (the built-in `notify` tool, see below), tools have no awareness of the event bus. MCP-backed tools implement the same interface; the MCP call is an implementation detail of `execute`. Custom user-authored tools cannot publish events.

### The `notify` Tool

`notify` is a built-in tool registered automatically on every body. It is the LLM's sole means of publishing an event and is how a role signals that its turn is complete.

```typescript
// Schema seen by the LLM
notify(input: { event_type: EventType; payload: EventPayload<EventType> }): { ok: true }
```

Behavior inside the body:

1. Validate `event_type ∈ soul.publishes`. Otherwise return a tool-error: `not_in_publishes`.
2. Validate `payload` against the discriminated-union schema for `event_type` (see `03-event-system.md`). Otherwise return a tool-error: `invalid_payload`.
3. Run the task-status guard (see Task Status and Idempotency below). On illegal transition, return a tool-error: `illegal_transition` (the LLM may try a different terminal, e.g. `review_failed` instead of `review_passed`).
4. On success, the body performs the compare-and-append on `task_status`, publishes `session.{session_id}.{event_type}`, returns `{ ok: true }` to the LLM, and **ends the turn loop for the current inbound event** regardless of any further LLM text. Any subsequent LLM tool calls in the same response are dropped with a warning log.

`notify` is the only tool whose `execute` touches the bus, and even then only via the body that owns it. The LLM is unaware of this; it sees `notify` as a normal tool with a JSON schema.

### The `bash` Tool

`bash` is a built-in tool that executes shell commands within the workspace root. It is the implementer's mechanism for running tests, linters, build tools, and any project-specific tooling.

```typescript
bash(input: { command: string; workdir?: string }): BashResult

interface BashResult {
  exit_code: number;
  stdout:    string;
  stderr:    string;
}
```

Rules:

- The command execs in the team's workspace root by default. `workdir`, if provided, is resolved relative to the workspace root — it cannot escape via `..` traversal.
- A fixed timeout (default 300s per invocation) kills the process and returns `exit_code = -1` with stderr: `"command timed out"`. This is a tool-result error; the body does not fail the task on timeout alone.
- The command runs with the workspace's environment (inherited from the agent process). No isolation sandbox beyond the workspace-root constraint in v1.
- Shell is `/bin/sh` (POSIX).
- Output (`stdout` + `stderr` combined) is truncated to 64 KiB; the tool returns a note when truncation occurred.
- Consecutive `bash` calls that consistently return non-zero exit codes are tool-result errors that decrement `error_turn_budget`. The implementer is expected to reason about and fix test/lint failures, not blindly retry.

## Tool Telemetry

Every tool call is observable on the event bus. The body emits two events per tool invocation:

- **`agent.tool.call`** — emitted **before** `tool.execute()`. Payload: `tool_call_id`, `name`, JSON-serialized `input`, `input_truncated`.
- **`agent.tool.result`** — emitted **after** `tool.execute()` returns (or throws). Payload: `tool_call_id`, `name`, JSON-serialized `output` (or `null` on throw), `output_truncated`, `duration_ms`, `error` (error message string or `null`).

`tool_call_id` is a per-agent uint32 monotonic counter starting at 0. It links each `call` to its `result`. Resets on agent restart (consumers key on `(agent_id, tool_call_id)`).

Input and output are JSON-serialized from the tool's actual arguments and return value. If the serialized string exceeds **4 KiB**, it is middle-truncated: the first `(4096 - MARKER_LEN) / 2` chars and last `(4096 - MARKER_LEN) / 2` chars are preserved, with a marker `...[N chars truncated]...` in between. The corresponding `*_truncated` flag is set to `true`.

Both events are **ephemeral** on JetStream. They are **observer-only** — no agent role subscribes to them. The TUI and diagnostic tooling consume them.

## AgentBody

```typescript
class AgentBody {
  readonly id:                 string;          // process instance id: {role}-{8-hex} minted fresh on every process start (see 03-event-system.md Identifiers)
  readonly soul:               AgentSoul;       // immutable after construction
  readonly error_turn_budget:  number;          // per-loop error tolerance; default 30
  readonly total_turn_budget:  number;          // per-loop hard turn cap; default 200

  private bus:        EventBus;
  private artifacts:  ArtifactStore;   // backs task_status; see Task Status below
  private memory:     MemoryStore;     // see 12-memory.md

  start(): void {}    // subscribes to soul.subscriptions on bus, begins event loop
  stop(): void {}     // unsubscribes, shuts down cleanly
}
```

- No inheritance. `AgentBody` is the only concrete class.
- Soul is immutable. An agent's role cannot change at runtime.
- Compaction is owned by the `MemoryStore`, not by the body. See `12-memory.md` for triggers and policy.
- The body is the **only** publisher of events on the bus. The LLM expresses publication intent through the `notify` tool; the body validates and executes the publish.

### Event Loop and Explicit Emission

While running:

1. Receive event matching one of `soul.subscriptions` from NATS.
2. If currently processing a prior event, append to a bounded FIFO queue (cap 8). On overflow, the body **asserts and exits**: under the serial pipeline (one upstream emission per role per task) the queue should hold at most one event, so overflow is a bug — broken subscription filters, a hung handler, or an unintended multi-producer scenario. The supervisor restarts the body; durable `session.*.task.*` replay redelivers any unprocessed lifecycle events. Drop-oldest is **not** an option: silently losing a task lifecycle event is unacceptable.
3. When idle, dequeue the next event and process it.

Processing an event = one LLM-driven loop of (think → optionally call tools → think → ...) bounded by the budgets below. The LLM signals completion of its turn for this inbound event by calling `notify(event_type, payload)`. On a successful `notify`, the body publishes the event (under the task-status guard) and the loop ends; further LLM output in the same response is ignored.

If the LLM ends its response (no further tool calls, no `notify`), the body grants exactly **one grace turn**: it sends a system-level reminder to the LLM ("your turn ended without calling `notify`; emit now or explain why you cannot") and resumes the loop. If the next response also ends without a successful `notify`, the body force-publishes `task.failed` with `phase = soul.role` and `error = "missing_emission"`. The grace turn does not decrement `error_turn_budget` but does decrement `total_turn_budget` by one.

Per-role rules for *which* terminal events are legal live with the role; see `08-role-definitions.md`. The LLM is responsible for picking the right one (e.g. reviewer chooses `task.review_passed` vs `task.review_failed` based on its own verdict).

### Task Status and Idempotency

Per-task progress is recorded as a `task_status` artifact in the artifact store (see `04-artifact-store.md`). The artifact store exposes:

```typescript
type TaskPhase =
  | 'recorded' | 'researched' | 'designed' | 'planned'
  | 'implemented' | 'review_passed' | 'review_failed'
  | 'done' | 'failed';

interface TaskStatus {
  task_id:    string;
  phase:      TaskPhase;
  iteration:  number;
  updated_at: string;  // ISO 8601
}
```

`task_status` rows are **append-only**. The latest row per `task_id` (by `created_at`) is the canonical current status. There is no separate KV substrate; the artifact store is the single source of truth.

When the LLM calls `notify`, the body performs an atomic compare-and-append on `task_status` via `cas_append_task_status`:

- Reads the current status (or `null` if no prior row).
- Validates the requested transition (`current_phase, role → next_phase`) against the role's allowed transitions.
- On legal transition: appends a new `task_status` row and publishes the event.
- On illegal transition (e.g. an agent tries to emit twice for the same iteration, or picks a phase its role is not allowed to advance to): the append is **not** performed and `notify` returns a tool-error to the LLM (`illegal_transition`). The LLM may retry with a different `event_type`. If the LLM exhausts options or the body's grace turn fires without a successful `notify`, `task.failed` is emitted as described in the Event Loop section.
- On a concurrent writer collision (`cas_append_task_status` returns `phase_changed`): the body retries the read+validate cycle once. A second collision returns the same `illegal_transition` error to the LLM.

`task.rejected` is the one event that does **not** mutate `task_status`. It is a pre-record signal published by the DM when no task artifact could be produced (no `task_id` to key state on, or DM choosing to decline the prompt). The body publishes the event and skips the CAS. See `08-role-definitions.md` "On Pre-Record Failure". Every other event type pairs with a `task_status` transition.

The DM's single-task-in-flight gate is enforced by DM behavior, not by a global lock. The DM uses the `read_task_status(task_id)` tool on prompt arrival to check whether the referenced `task_id` is currently in flight (any phase other than `done` or `failed`) and decides accordingly. Across distinct `task_id`s, the DM relies on its own working memory (managed by the Memory subsystem; see `12-memory.md`) to know whether a task is currently in flight; the body's CAS provides per-task correctness but does not enforce the global "at most one in flight" property.

The body's CAS still gives strong per-task guarantees: the DM cannot publish a second `task.recorded` for the same `task_id` while it is in any non-terminal phase. Terminal phases for the in-flight gate are `done` and `failed`. (`review_passed` is **not** terminal: it is the reviewer's verdict; the DM is required to advance it to `done` after finalization.) Re-entry of a `failed` task is permitted: DM may emit `task.recorded` for a `task_id` whose current phase is `failed`, starting a new session at `iteration = 1`. `done` is permanent for that `task_id`; once a task reaches `done` it cannot be re-entered.

The transition table lives with the role definitions in `core`; see `08-role-definitions.md`.

### Concurrency Model

Pipeline seriality: each role's subscription is downstream of the previous role's emission, so under normal operation only one agent is processing at a time per task. The DM enforces single-task-in-flight via its own reasoning, backed by the `read_task_status` tool and the per-task CAS in the artifact store (see above and `08-role-definitions.md`). There is no team-wide distributed latch.

### Failure Handling

Agents resolve errors using LLM reasoning; they are not crash-and-restart components. Two **fixed budgets**, scoped to one event-handling loop (one inbound event = one body run of the LLM loop), bound runaway behavior. Both initialize from `AgentBody` at construction and decrement only; neither resets.

- **`error_turn_budget`** (default 30, per-body). Decrements by one on every turn that consumes at least one tool-result error. Pure-thinking turns (no tool calls) do not decrement it. All-success turns do not decrement it. When it hits zero, the body force-publishes `task.failed` with `error = "error_budget_exhausted"`.
- **`total_turn_budget`** (default 200, per-body). Decrements by one on every LLM turn unconditionally — error turns, success turns, pure-thinking turns, and the missing-emission grace turn. Safety net against pathological loops. When it hits zero, the body force-publishes `task.failed` with `error = "turn_budget_exhausted"`.

Tool errors are returned to the LLM as tool-result messages in the same conversation; the LLM may try a different approach.

**MCP server crash mid-session.** If an MCP server becomes unreachable while a tool call is in flight, the tool returns a fatal error (`mcp_server_unreachable`). The body treats this as an unrecoverable error: it logs the server and tool name, force-publishes `task.failed` with `error = "mcp_server_unreachable:{server}"` and `phase = soul.role`, and exits. No retry, no reconnect. The supervisor restarts the agent; the DM may re-enter the task from `failed`. The same policy applies if the MCP server goes down between tool calls and the next MCP-backed tool call fails immediately.

**NATS disconnect** is handled the same way: the body force-publishes `task.failed` with `error = "nats_disconnect"` and exits. The supervisor restarts the process.

## ExecutionContext

Passed to every tool call. Provides identifiers and storage; **does not** expose the event bus. The `notify` tool is the sole route to the bus and reaches it through the body, not through `ExecutionContext`.

```typescript
interface ExecutionContext {
  session_id:  string;
  task_id:     string;
  iteration:   number;
  agent_id:    string;
  agent_role:  AgentRole;
  artifacts:   ArtifactStore;
  // No `bus` field. Only the `notify` built-in publishes, and it does so
  // via the body, not via this context.
}
```
