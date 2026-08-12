# Agent Model

Three concepts make up the agent model: `AgentSoul` — the immutable behavioral profile (model, system prompt, tools, subscriptions); `AgentBody` — the runtime that wraps a pi-agent-core `Agent` and bridges it to the event bus; `ExecutionContext` — the per-tool-call context carrying identity and storage handles. Souls are derived from the team blueprint at startup; the platform builds one body per agent instance; bodies are the only publishers on the bus.

## AgentSoul

```typescript
interface AgentSoul {
  readonly role: string;                       // role identifier — the agent's .md filename stem
  readonly model: string;                      // '<provider>/<model_id>' or alias, resolved via pi-ai's getModel
  readonly effort?: EffortLevel;               // 'off' | 'low' | 'medium' | 'high' | 'max', parsed from optional model(<effort>) suffix
  readonly systemPrompt: string;               // prose body of the agent's .md file, verbatim
  readonly tools: ReadonlyArray<string>;       // tool spec strings (`name` or `name(args)`; ADR 37), resolved through the ToolRegistry
  readonly subscribe: ReadonlyArray<string>;   // un-scoped domain topics; body listens on custom.{teamId}.{topic}
  readonly skills: ReadonlyArray<string>;      // skill spec strings, resolved through the SkillManager
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

Each entry in `AgentSoul.tools` is a spec string: a bare `name` (unrestricted) or `name(args...)` carrying capability-limit args (ADR 37). The body parses any args into `toolArgs` before resolving, so `resolve` receives the name part only. `resolve` matches the segment after the last `:` (the whole string when there is none) against registered tool names using anchored `Bun.Glob` matching (`*`, `?`): a plain name resolves to itself, a glob to zero-or-more tools. Whether zero matches is a startup failure is the caller's policy (`10-configuration.md` "MCP Server Configuration"). Built-ins are registered at platform startup; MCP-provided and user-defined tools are registered onto the registry by the platform — the body cannot tell where a tool executes (ADR 4). A tool flagged `isUtility` is agent-internal tooling without project side-effects and is implicitly assigned to every agent at body construction, listed by a soul spec or not; a spec that already matches it does not assign it twice.

## Team Blueprint

The blueprint lives at `.jie/teams/<team_id>/` (file layout, discovery, model resolution: `10-configuration.md`):

```
.jie/teams/myteam/
  TEAM.md              # YAML frontmatter: leader
  leader.md            # one .md per role — the filename stem is the role identifier
  worker_a.md
```

`TEAM.md` declares `leader: <role>`. Every other `.md` file is an agent definition: YAML frontmatter declares the mechanical surface, the prose body becomes `AgentSoul.systemPrompt`.

`TEAM.md` declares only `leader: <role>`; the platform enforces no team-specific workflow. Per-role capability limits live in each role's `tools` list as tool specs (ADR 37):

```yaml
tools:
  - notify(task.recorded, task.done)   # restricts publishable topics
  - write_file(**/MODULE.md)          # restricts writable paths (glob); bare name = unrestricted
```

A spec is `name` (unrestricted) or `name(args...)` (restricted). The platform parses specs once at body construction into `ExecutionContext.toolArgs`, a map keyed by tool name; a tool that opts into limits reads its own args. Two built-ins consume args: `notify(topics...)` limits publishable topics (`TOPIC_NOT_ALLOWED`), and `write_file(globs...)` / `edit_file(globs...)` limit writable paths (`WRITE_PATH_DENIED`), checked against the workspace-relative path. Workflow ordering is not a platform concern: it emerges from each role's `subscribe` list, and task progress is tracked on the kanban board and via artifacts, not by platform state.

| Field | Required | Meaning |
|---|---|---|
| `model` | no | `<provider>/<model_id>`, alias, or `<ref|alias>(<effort>)` (e.g. `large(low)`); when absent, inherited from the user's global default (`10-configuration.md` "Model Resolution"). The effort suffix is parsed at load and pins the agent's effort; it is not part of the resolved model reference. |
| `tools` | yes | Tool spec strings (`name` or `name(args)`, ADR 37) resolved through the `ToolRegistry` at body construction; a spec's args are parsed into `toolArgs` for capability limits. Utility tools are assigned implicitly regardless of the specs. |
| `replica` | no | Positive integer (default 1, max 8). Number of agent bodies to instantiate for this role, each with a stable `agentKey` of `{role}-{N}`. |
| `subscribe` | no | Un-scoped domain topic names. Entries starting with `agent.` are rejected at parse time (`subscribe_rejects_platform_topic: <topic>`) and the team fails to start — platform events (`agent.*`) are observer-only, never agent-consumed; the platform manages isolation so team authors never see platform subjects. |
| `skills` | no | Skill spec strings resolved through the `SkillManager` at body construction (wildcards allowed, same anchored-glob semantics as `tools`; a spec matching nothing is silently discarded, unlike tool specs, which fail team load). Each matched skill is listed in the agent's system prompt; the agent loads a skill body on demand with `read_file` (`10-configuration.md` "Skills"). |

Each role maps to one or more persistent `agentKey = {role}-{N}`; `replica:` in the role frontmatter (default 1, max 8) controls the instance count. Leader identification is a team-level fact: a multi-agent team (≥2 `.md` files) requires `TEAM.md` with a `leader:` field referencing an existing role; a single-agent team without `TEAM.md` makes its only role the leader implicitly. The loader passes `isLeader` to the body's constructor; it surfaces in `AgentInfo` (carried by `system.team.loaded`) and is **not** used for event routing — every body is addressed by `agentKey` (see "Subscription Model" below).

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
  readonly toolArgs: ReadonlyMap<string, ReadonlyArray<string>>;  // parsed tool-spec args, keyed by tool name (ADR 37); empty when no spec carries args
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
  readonly isUtility?: boolean;    // utility tools are implicitly assigned to every agent
  readonly parameters: TSchema;    // TypeBox schema — the LLM-visible tool schema
  prepareArguments?(raw: unknown): unknown;  // optional compat shim run before schema validation
  execute(input: TInput, executionContext: ExecutionContext, signal?: AbortSignal): Promise<ToolResult>;
}

interface ToolResult {
  readonly content: string;        // text returned to the LLM conversation
  readonly details?: ToolResultDetails | null;  // closed union, defined in types.ts; never shown to the LLM; dropped at persist unless kind is "diff"
  readonly terminate?: boolean;    // pi-agent hint: stop after this tool batch
}
```

`details` is the closed `ToolResultDetails` union (`tools/types.ts`): one member per builtin producer (`edit_file`/`write_file` share the `kind: "diff"` discriminator, `write_kanban` the `kind: "kanban"` one; the rest are un discriminated per-tool shapes). Builtin tools are the only producers — MCP tools emit no details — so consumers narrow statically and no runtime guard exists.

Except for the built-in `notify` (which receives its `EventManager` as a construction dependency), tools have no awareness of the event bus; custom team-defined tools cannot publish events. Business identifiers (work ids, …) are opaque to the platform; the receiving LLM extracts them from message text, and the platform never takes a task identifier as an input (ADR 37).

**Errors.** Failures throw `JiePlatformError` (typed code + human-readable message; canonical codes live in `jie-platform-errors.ts`); pi-agent surfaces the throw as an `isError` tool result and the LLM reads the message text and reasons.

**Timeout.** The adapter (`core/tool-adapter.ts`) combines any pi-agent-provided signal with `AbortSignal.timeout(tool.timeout ?? 120_000)` (`AbortSignal.any` when both exist); `bash` overrides the default to 300s.

### Tool Adaptation to pi-agent

At body construction, each Jie `Tool` is wrapped into pi-agent-core's `AgentTool`:

| pi-agent field | Adaptation |
|---|---|
| `name`, `description`, `label`, `parameters` | Copied from `Tool` (the TypeBox schema is passed directly) |
| `prepareArguments(raw)` | Runs the tool's own optional `prepareArguments` shim first (e.g. `edit_file` rewriting the legacy single-pair form into `edits`), then `Value.Check(parameters, prepared)`; throws on mismatch and pi-agent surfaces the throw as a tool error. No coercion beyond the tool's shim — the LLM's args must match the schema. |
| `execute(toolCallId, params, signal?, onUpdate?)` | Combines signals per the timeout rule, calls `tool.execute(params, ctx, combined)`, wraps the return as `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate ?? false }`. Throws (including `AbortError`) propagate. The `onUpdate` callback is not bridged — v1 tools return one final `ToolResult`. |
| `executionMode` | Always `"sequential"` |

Day 2: bridging `onUpdate` (live partial results), parallel tool execution.

## Built-in Tools

Registered at platform startup by the `InMemoryToolRegistry` constructor (a cradle singleton from `tools/module.ts`):

| Tool | Purpose |
|---|---|
| `bash` | shell commands in the workspace root (300s timeout; whole process group) |
| `read_file` | bounded text-file reads |
| `write_file` | text-file writes (overwrite), per-role path allowlist via globs |
| `edit_file` | search-and-replace inside a file, with diff preview; serialized per path |
| `ls` / `find_file` / `grep_file` | workspace file discovery: list, glob-find, content grep |
| `read_artifact` / `write_artifact` / `find_artifact` | key-value work-product store |
| `write_kanban` | live kanban board (utility — implicitly assigned to every agent) |
| `notify` | publish to the team event bus (see "notify and the Subscription Model") |
| `web_search` / `web_fetch` | web access |
| `memory_add` / `memory_search` | team long-term memory write/search (opt-in via `tools:`, `11-memory.md`) |

### Built-in tool contracts

Built-ins are registered at startup by `InMemoryToolRegistry` from `tools/tool-registry.ts`; the per-invoke limits and the LLM-facing argument schemas live on the tool sources (e.g. `bash.ts`, `read-file.ts`). `10-configuration.md` "Platform Limits" centralizes every cap. The LLM-facing `content`/`details` shapes are the design notes below.

Shared conventions: file paths resolve against the workspace root and must stay inside it (`path_escape` / `workdir_escape`); text tools are UTF-8 only; default timeout 120s unless a tool overrides (`bash` 300s). `write_file` and `edit_file` run the per-role path allowlist (when the role spec carries globs) and are serialized per real path — concurrent calls on the same file never interleave. `edit_file` accepts the legacy single-pair form via its `prepareArguments` shim and matches through BOM/CRLF normalization.

Design notes (rationale that is not obvious from the signatures):
- **bash** never throws on non-zero exit — throwing would discard stdout/stderr, which is what the LLM asked for; the `content` carries `exit_code` + stdout/stderr and `details: { exitCode, truncated }`; the detached shell is killed as a process group so SIGTERM/SIGKILL reach backgrounded descendants.
- **read_file / write_file / edit_file** return a one-line ack in `content`; the diff lives only in `details` (a TUI-only payload, dropped at persist unless `kind: "diff"`). `write_file` returns just the byte summary since the model just wrote the content and a file-sized diff back would waste tokens (`edit_file` returns just an ack too — it confirms a targeted change via `replacementsCount`, not a diff). Full rationale: ADR 9.
- **Artifact store** is not team-scoped by the platform (two teams sharing a key collide) and artifact content never travels in events — only keys. `read_artifact` of a missing key is a normal result, not an error.
- **write_kanban** replaces the team's board (full desired state); cards merge by `content` so `#1`/`#2` ids stay stable across rewrites; duplicate `content` is rejected (`kanban_write_invalid`).
- **memory_search** is opt-in via `tools:`; `memory_add` is opt-in too. Extraction runs after a successful compaction commit (fire-and-forget, single-flight per body).
- **web_search / web_fetch**: `web_search` delegates to a pluggable provider (default DuckDuckGo HTML; no API key); non-2xx HTTP is returned with a body, never a typed error — the LLM branches on status.

## notify and the Subscription Model

### notify

A built-in tool; an agent can publish if and only if its soul lists `notify` in `tools`. It is the LLM's sole means of publishing an event.

```typescript
notify(input: { topic: string; prompt: string })
```

Behavior:

1. **Topic validation.** Rejects with `notify_invalid_topic: <reason>` when the topic is empty (`empty`), starts with `agent.` (`starts_with_agent_prefix` — platform events are observer-only), starts with `{team_id}.` (`starts_with_team_prefix` — the platform manages the scoping), or contains a null byte or control character (`contains_null_byte`).
2. **Prompt validation.** Rejects with `notify_prompt_too_long` when the prompt exceeds `EVENT_TEXT_TRUNCATION_BYTES` (4096 chars) — so `custom.*` payloads published via `notify` are never truncated in flight.
3. **Allowed-topics check** (ADR 37), when the role's `notify` spec carries topics. If the `topic` is not among the spec's allowed topics, throws `TOPIC_NOT_ALLOWED` and nothing is published; a bare `notify` spec (no topics) allows any valid topic.
4. **Publish.** `Events.custom(sender, `${teamId}.${topic}`, prompt)` → bus topic `custom.{teamId}.{topic}`, envelope `sender: { kind: "agent", teamId, agentKey }`, payload `{ message, truncated }`. The LLM supplies the un-scoped topic; the body prefixes `{team_id}.` and the bus adds the `custom.` prefix.

Returns `Notification published on '<topic>'` with `details: { topic }`. The LLM continues processing; `notify` is a regular tool, not a loop-control signal, and does not end the turn (ADR 6).

### Subscription Model

User prompt ingress is the single `user.prompt` topic with payload `{ teamId, agentKey, prompt }` — the caller resolves "the leader" to an `agentKey` before publishing. The envelope, sender, and topic catalog are documented in `03-event-system.md`; this section documents body behavior only. At `start()`, each body subscribes (the bus-level subscription table is in `03-event-system.md`; this section is the body-side behavior):

- `user.prompt`, `agent.interrupt`, `user.prompt.dequeue`/`requeue` — filtered on `teamId` + `agentKey`. `isLeader` adds no subscription.
- `user.effort.update`, `user.model.update` — broadcast; every body applies them.
- `custom.{teamId}.{topic}` per `soul.subscribe` entry — self-receipt filtered in the body (the bus is identity-agnostic; per-subscriber error containment is in `03-event-system.md`).

**Ingress.** `user.prompt` becomes a synthetic `[user]: {prompt}` message; a `custom.*` notification becomes `[{agentKey} on '{topic}']: {prompt}` (un-scoped topic from the `notify` call). A `user.prompt` additionally stamps the raw text as a `displayText` field so hydration recovers the exact user text regardless of skill/hook transformation; peer notifications carry none. Every ingress enters the in-memory FIFO `PromptQueue`; the body drains it: idle → `agent.prompt()` starts a new run; streaming → stays queued until handed over; a healthy `turn_end` feeds the head via `agent.followUp()`; the `agent_end` drain is deferred until pi settles, then starts a new run. Dequeue/requeue preserve arrival order; enqueue/dequeue publish `agent.prompt.queue.update` snapshots (user text tagged `"user"`, peer synthetic tagged `"peer"`).

**Dequeue invariant.** `user.prompt.dequeue` removes the tail-most `"user"` entry whose raw text matches, republishes the snapshot always (even on a miss, to resync observers), and parks the entry in a 32-entry side-pile keyed by raw text (oldest evicted); only user entries are removable, and matching by text is idempotent and race-free. **Requeue** pops the matching side-pile entry back to the tail without re-running hooks/skills, republishes, and drains (an idle body starts it immediately); a fresh `user.prompt` whose text matches a parked entry discards the parked one (resubmission supersedes).

**Effort/model hot-swap.** `user.effort.update` sets `thinkingLevel` (`max`→`xhigh`, else passthrough) and republishes `agent.model.assigned` when a model is assigned; pinned souls ignore the broadcast, mirroring `user.model.update` behavior. `user.model.update` hot-swaps the model only for bodies whose soul does *not* pin a model (mirrors load-time precedence); an unresolvable reference is a silent no-op. Both carry `contextWindow` on every publish so observers track the live model.

**Hook + skill.** `user.prompt` runs `UserPromptSubmit` before dispatch (block → `system.error`; `additionalContext` appended); peer notifications skip it. Because the hook may block, ingress is async. A `/skill:<name>` prefix is expanded against the body's resolved skills before dispatch (`Skill.expandInvocation`, `$ARGUMENTS`/`$n` interpolation when the skill has args, else appended after the block); unknown names pass through unchanged. The raw prompt (not the expansion) rides the `agent.turn.start` payload and is what the hook sees; skills re-resolve on `/reload`.

## AgentBody

The public contract:

```typescript
interface AgentBody {
  readonly identity: AgentInfo;   // { teamId, role, agentKey, isLeader, tools, subscribe, skills, model }
  start(): Promise<void>;
  stop(): void;
}
```

The `agentBodyFactory` cradle entry (registered in `core/module.ts`, invoked by `TeamManager` on team load and reload) builds the single concrete implementation: per-body `AgentBodyParams` (`agentKey`, `teamId`, `soul`, `isLeader`, `sessionId`, `effort`, and the resolved pi-ai `Model`) plus cradle-scoped deps (`eventManager`, `artifactStore`, `transcriptStore`, `toolRegistry`, `skillManager`, the `loadSystemContextBlock` loader invoked per body, `hookRunner`, `cwd`, `getApiKey` and `resolveModel` derived from the model registry, and the `settingsStore` feeding the compactor's settings getter); the factory also constructs one shared `Compactor` over the `transcriptStore` for all bodies ("Compaction" below; session identity travels per `compact` call). No inheritance — the body wraps pi-agent-core's `Agent`, which owns the LLM loop, tool execution, streaming, and context transformation. The soul is immutable; the body is the only publisher on the bus.

**Internal components.** The body composes five components, constructed directly in its constructor (impl classes, not cradle-registered, not re-exported from the module — only the body and the unit tests know the impl types). Each receives file-private deps; where a component must touch the pi-agent, the body passes a narrow handle — state getters/setters or dispatch actions (`prompt`/`followUp`/`isStreaming`) — never the `Agent` itself:

| Component | Responsibility |
|---|---|
| `PromptQueue` | the ingress queue, dequeue/requeue, dispatch, and `agent.prompt.queue.update` snapshots ("Subscription Model" below) |
| `AgentEventBridge` | bridging pi-agent events onto the bus, message persist, the `Stop` hook ("Event Bridging" below) |
| `ToolCallObserver` | tool telemetry events and the PreToolUse/PostToolUse command hooks ("Tool telemetry hooks" below) |
| `CompactionRunner` | single-flight compaction execution, abort, and the state rewrite ("Compaction" below) |
| `ModelController` | model/effort state, `agent.model.assigned` publication, and the `user.effort.update`/`user.model.update` handling ("Subscription Model" below) |

The body retains orchestration: lifecycle (`start`/`stop`/`restore`), subscription registration, the `UserPromptSubmit` hook and skill expansion on user ingress, and the two compaction trigger points (guarded by the model check).

**`start()` ordering.** (1) Register the subscriptions above and fire the `SessionStart` hook (once per body — `start()` is idempotent; 10-configuration.md "Hooks"). (2) `transcriptStore.restore(agentKey, sessionId, teamId)` and push the rows into `agent.state.messages`. (3) If the restored history ends with a `user` or `toolResult` message, `agent.continue()` to resume the in-flight turn. (4) Drain anything that arrived on subscribed topics during startup via `agent.prompt()`. The body does not publish `agent.idle` at startup — a body that has never run a turn is idle by default. `stop()` unsubscribes everything.

**Agent construction.** The `Agent` is wired with: `sessionId`+`getApiKey`, `streamFn: streamSimple`, pi-agent's `convertToLlm` (a `compactionSummary` renders as a `user` message wrapping the summary), `steeringMode: "all"`, `followUpMode: "all"`, `toolExecution: "sequential"`, and a `transformContext` that applies only the `Compactor.fitToWindow` window guard (pi-agent's own compaction never runs). The body sets `systemPrompt` via `composeSystemPrompt` (context block → memory block → role prose → skills) and `agent.state.tools` (adapted `AgentTool[]` via `core/tool-adapter.ts`). The `ModelController` reads the soul's model/effort, sets `agent.state.model`/`thinkingLevel`, and publishes `agent.model.assigned` when a model is assigned. See `core/jie-agent-body.ts` for the full wiring; the pi-agent constructor surface is in `pi-agent-api-reference.md`.

### Event Bridging

The body wires pi-agent's `AgentEvent` stream to the `AgentEventBridge`, which bridges it to the bus:

| pi-agent event | Bus event |
|---|---|
| `turn_start` | `agent.turn.start` or `agent.turn.continue` — deferred to the turn's next pi event and published before that event. A `message_start(user)` flush publishes `agent.turn.start` with the prompt this turn consumes (raw user text for a `user.prompt`, null otherwise), resolved from the `PromptQueue`'s pending dispatch for a `prompt()`-started turn or from a label keyed by the supplied message for a `followUp()`-fed turn, consumed once. Any other flushing event (no new user message — a tool-use continuation) publishes `agent.turn.continue` (null payload); the current conversation turn is not rotated |
| `message_start`, `message_update`, `message_end` (assistant) | streaming pipeline → `agent.stream.chunk` / `agent.stream.end`; assistant `message_end` also publishes `agent.usage` when the message carries usage |
| `message_end` (every role) | `transcriptStore.persist(message, agentKey, sessionId, teamId)` — unconditional, no role check; a `toolResult` message is projected first: its `details` is dropped unless `kind` is `"diff"` (see Memory Integration) |
| `turn_end` | on a healthy turn (final `stopReason` not `error`/`aborted`), dequeue one queued message via `agent.followUp()` to continue this run; publish `agent.prompt.queue.update` |
| `agent_end` | `agent.idle` with the final `stopReason`; also `system.error` when the run ended `error`/`aborted` with a message; fire the `Stop` hook; then defer until pi settles the run — the compaction check runs first ("Compaction" below), then the queue head starts a new run via `agent.prompt()` (an error/aborted `turn_end` feeds nothing, so its queued entries survive to this drain) |
| `agent_start`, `tool_execution_*` | not bridged — tool telemetry comes from the `beforeToolCall`/`afterToolCall` hooks |

**Streaming.** pi-agent `message_update` text/thinking deltas buffer per `block_type` in the bridge and flush as `agent.stream.chunk`; the assistant `message_end` flushes the remainder and publishes `agent.stream.end` carrying per-thinking-segment durations (empty without thinking). Flush triggers (chunk char count, flush timer) are config tunables (`10-configuration.md` "Streaming Tunables"); the pipeline lives in `core/streaming.ts`.

**Tool telemetry hooks.** `beforeToolCall`/`afterToolCall` seams feed the `ToolCallObserver` (in `core/tool-call-observer.ts`), which publishes `agent.tool.call` / `agent.tool.result`; `tool_call_id` is pi-agent's opaque id passed through to both events as the correlation key. `output` serializes the whole Jie `ToolResult`; both `input` and `output` are middle-truncated to 4 KiB (`EVENT_TEXT_TRUNCATION_BYTES`) for the events only — the LLM always sees untruncated I/O. These events are observer-only. The same seams run the command hooks: `PreToolUse` (before publish; a block prevents execution) and `PostToolUse` (a block replaces the result; `additionalContext` appends to content) — see `10-configuration.md` "Hooks". Telemetry is published regardless of hook outcome.

### Agent Loop and Termination

A prompt drives one pi-agent run: think → optionally call tools → think → … until the LLM's `stopReason` is `stop`, `length`, `error`, or `aborted` (`toolUse` continues the loop). The platform adds no turn budgets and no grace turn: `notify` is a regular tool the LLM calls when its system prompt instructs it to, and `ToolResult.terminate` is handled natively by pi-agent (stop after the batch) without platform interpretation (ADR 6). Bodies process their own queues serially; pipeline seriality (one agent active per task) falls out of the team's subscription graph, not a platform mechanism. Error resolution is LLM reasoning over tool-result text — agents are not crash-and-restart components.

## Memory Integration

Three facts belong here; the full contract is canonical in `08-transcript.md`.

- **Write-through persist.** Every pi-agent `message_end` → `transcriptStore.persist(...)` to SQLite, unconditionally (no role check, no buffering). Before persisting, the body projects a `toolResult` message to its persistable form: `details` is dropped unless `kind` is `"diff"` — the diff payload is the only one hydration reads back (history rendering); the kanban board hydrates from `TeamInfo.kanbanCards`, so kanban details are live-only, and every other kind serves only hooks and live telemetry, which never read stored rows. The live message in pi-agent state is not mutated, so same-process history and `agent.tool.result` events keep the full payload.
- **Session identity.** The `sessionId` is minted per process run × team by the platform (`TeamManager`) and passed to the body (ADR 17); all agents of one team in one process share it. `jie --resume <id>` validates via `transcriptStore.hasSession` and fails hard with `unknown_session` on a miss. `restore()` on `start()` returns the prior rows for `(teamId, agentKey, sessionId)`; a fresh session restores empty.
- **Compaction.** Between runs and mid-run between turns, the shared `Compactor` may rewrite the stored history to a summary plus a recent tail (`08-transcript.md` "Compact"); on success the body's `CompactionRunner` applies the same rewrite in memory — `agent.state.messages` becomes `[summaryMessage, ...messages.slice(firstKeptIndex)]`. Because the `Agent` was constructed with `convertToLlm`, the surviving `compactionSummary` message enters the next LLM request as a `user` message carrying the summary — whether it was just written or restored on `start()`.

### Compaction

The body triggers compaction; execution is delegated to a per-body `CompactionRunner` (single-flight, abortable). pi-agent's own `transformContext` compaction path never runs — the body passes a `transformContext` that only applies the Compactor's window guard (`fitToWindow`). One shared `Compactor` is built over the `transcriptStore` (no per-body state); each call carries the body's `agentKey`/`sessionId`/`teamId` so it forwards to `transcriptStore.compact`. The Compactor exposes `needsCompaction(messages, contextWindow)` (threshold pre-check), `compact(input)` (`null` = nothing done: below threshold, nothing summarizable, or no model assigned), and `fitToWindow(messages, model)` (window guard). Settings come from the merged `compaction` block via a `settingsStore` getter read per call, so a file edit applies at the next trigger and `enabled: false` disables it.

Strategy: (1) **Threshold.** Proceed only when estimated context tokens since the last summary exceed `contextWindow - reserveTokens` (prefer last assistant usage, fall back to char estimate; re-estimate from chars when a restored usage message predates the summary). (2) **Cut point.** Walk back until `keepRecentTokens` is covered, then pick the earliest `user`/`assistant` boundary whose tail fits `keepRecentTokens` with a non-empty prefix; `toolResult` and `compactionSummary` are never cut points. `null` if the prefix is empty or all-prior-summaries. (3) **Summarize.** Verify stored non-compacted row count equals in-memory length (mismatch throws); cap the prefix by the same window guard (budget `contextWindow - maxTokens - slack`) so an oversized prefix can't overflow the call; one `LlmService.complete` over the capped, serialized prefix, updating a previous summary when one exists; the result becomes a `compactionSummary` message persisted via `transcriptStore.compact`.

**Context fitting.** Independently, every request passes through `fitToWindow` (a hot-swapped model's window applies immediately). When the total exceeds `contextWindow - reserveTokens`, messages are truncated largest-first until it fits — only text-bearing fields shrink (`user`/`toolResult`/`custom` text, assistant `text`/`thinking`, `bashExecution` output, `summary`), head kept with a `[content truncated to fit the context window]` marker; `toolCall` blocks and structure are never touched, so `toolResult` pairing stays intact. Fitting is pure/immutable: stored history and the TUI keep full content; only the request copy is trimmed.

Triggers (all go through the per-body runner, which single-flights concurrent triggers): mid-run between turns via `prepareNextTurnWithContext` (after a healthy `turn_end`, before the next call, returning the compacted context so the loop keeps going); after a run settles (`agent_end` → `waitForIdle`) and just before dispatching an ingress prompt. A body with no model never compacts (guarded before the call). `stop()` aborts an in-flight summarization. A failure publishes `system.error` (`compaction failed: <message>`) and leaves history untouched — it never blocks the queue; the next trigger retries. A success publishes `agent.compacted` (summary, `tokensBefore`, user-message count of the prefix; `03-event-system.md`) which the TUI renders (`tui-state.md`). The `start()` restore path is silent — the persisted `compactionSummary` row hydrates directly.

## Boundary Enforcement (Platform vs Team)

The platform's file tools (`read_file`, `write_file`, `edit_file`, and `bash`'s `workdir`) enforce **workspace-root containment**: the resolved absolute path must stay inside the resolved workspace root, or a typed `path_escape` / `workdir_escape` error results. On top of that, `write_file` and `edit_file` enforce a per-role path allowlist when the role's tool spec carries globs (`WRITE_PATH_DENIED`; ADR 37). Beyond both, module boundaries and no-new-exports rules remain team-defined constraints (ADR 9):

| Layer | Enforces | Status |
|---|---|---|
| Platform file tools | "inside the workspace root" | v1 |
| Per-role `write_file`/`edit_file` globs (declared in the role's `tools` spec) | path patterns per role | v1 |
| Team blueprint (role system prompt, or a wrapper tool the team defines) | "inside the allowed module boundary" | Day 2, team-owned |

Consequence: in v1 an agent with a bare `write_file` can write any file inside the workspace root, including files in a sealed module, and `bash` bypasses the path limits entirely; the limits police cooperative file-tool writes on declared paths, not the shell. Preventing more than that is the team layer's contract, by design.
