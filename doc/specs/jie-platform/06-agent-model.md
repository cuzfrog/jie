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

Each entry in `AgentSoul.tools` is a spec string. `resolve` matches the segment after the last `:` (the whole string when there is none) against registered tool names using anchored `Bun.Glob` matching (`*`, `?`): a plain name resolves to itself, a glob to zero-or-more tools. Whether zero matches is a startup failure is the caller's policy (`10-configuration.md` "MCP Server Configuration"). Built-ins are registered at platform startup; MCP-provided and user-defined tools are registered onto the registry by the platform — the body cannot tell where a tool executes (ADR 4). A tool flagged `isUtility` is agent-internal tooling without project side-effects and is implicitly assigned to every agent at body construction, listed by a soul spec or not; a spec that already matches it does not assign it twice.

## Team Blueprint

The blueprint lives at `.jie/teams/<team_id>/` (file layout, discovery, model resolution: `10-configuration.md`):

```
.jie/teams/myteam/
  TEAM.md              # YAML frontmatter: leader
  leader.md            # one .md per role — the filename stem is the role identifier
  worker_a.md
```

`TEAM.md` declares `leader: <role>`. Every other `.md` file is an agent definition: YAML frontmatter declares the mechanical surface, the prose body becomes `AgentSoul.systemPrompt`.

| Field | Required | Meaning |
|---|---|---|
| `model` | no | `<provider>/<model_id>`; when absent, inherited from the user's global default (`10-configuration.md` "Model Resolution"). Always a resolved string by soul-construction time. |
| `tools` | yes | Tool spec strings resolved through the `ToolRegistry` at body construction (utility tools are assigned implicitly regardless of the specs). |
| `subscribe` | no | Un-scoped domain topic names. Entries starting with `agent.` are rejected at parse time (`subscribe_rejects_platform_topic: <topic>`) and the team fails to start — platform events (`agent.*`) are observer-only, never agent-consumed; the platform manages isolation so team authors never see platform subjects. |
| `skills` | no | Skill spec strings resolved through the `SkillManager` at body construction (wildcards allowed, same anchored-glob semantics as `tools`; a spec matching nothing is silently discarded, unlike tool specs, which fail team load). Each matched skill is listed in the agent's system prompt; the agent loads a skill body on demand with `read_file` (`10-configuration.md` "Skills"). |

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
  readonly isUtility?: boolean;    // utility tools are implicitly assigned to every agent
  readonly parameters: TSchema;    // TypeBox schema — the LLM-visible tool schema
  prepareArguments?(raw: unknown): unknown;  // optional compat shim run before schema validation
  execute(input: TInput, executionContext: ExecutionContext, signal?: AbortSignal): Promise<ToolResult>;
}

interface ToolResult {
  readonly content: string;        // text returned to the LLM conversation
  readonly details?: unknown;      // structured payload for afterToolCall hooks / telemetry / TUI display; never shown to the LLM; dropped at persist unless kind is "diff" or "kanban"
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
| `prepareArguments(raw)` | Runs the tool's own optional `prepareArguments` shim first (e.g. `edit` rewriting the legacy single-pair form into `edits`), then `Value.Check(parameters, prepared)`; throws on mismatch and pi-agent surfaces the throw as a tool error. No coercion beyond the tool's shim — the LLM's args must match the schema. |
| `execute(toolCallId, params, signal?, onUpdate?)` | Combines signals per the timeout rule, calls `tool.execute(params, ctx, combined)`, wraps the return as `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate ?? false }`. Throws (including `AbortError`) propagate. The `onUpdate` callback is not bridged — v1 tools return one final `ToolResult`. |
| `executionMode` | Always `"sequential"` |

Day 2: bridging `onUpdate` (live partial results), parallel tool execution.

## Built-in Tools

Registered at platform startup by the `InMemoryToolRegistry` constructor (a cradle singleton from `tools/module.ts`):

| Tool | Purpose |
|---|---|
| `bash` | shell commands in the workspace root |
| `read_file` | bounded text-file reads |
| `write_file` | text-file writes (overwrite) |
| `edit` | search-and-replace inside a file, with diff preview |
| `read_artifact` / `write_artifact` | key-value work-product store |
| `kanban_write` | live kanban board (utility — implicitly assigned to every agent) |
| `notify` | publish to the team event bus (see "notify and the Subscription Model") |
| `web_search` / `web_fetch` | web access |

Shared conventions: file paths resolve against the workspace root and must stay inside it (`path_escape` / `workdir_escape`); text tools are UTF-8 only; the 120s default timeout applies unless noted.

### bash

```typescript
bash(input: { command: string; workdir?: string })
```

Execs `/bin/sh -c` in the workspace root (or a `workdir` resolved inside it via `realpath`; escape throws `workdir_escape`). The platform's own 300s timeout sends SIGTERM then SIGKILL after a 5s grace and throws `command_timed_out`; abort sends SIGTERM without throwing. The shell is spawned detached, so either kill reaches the whole process group, backgrounded descendants included; OS-level signal kills from outside the platform surface as normal non-zero exits (`exit_code: 143` for SIGTERM, `137` for SIGKILL) — the LLM branches on `exit_code > 128`. stdout and stderr are captured independently, each clipped at 32 KiB with a `[truncated to 32 KiB]` marker. The `content` format:

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

The platform enforces workspace-root containment only (`path_escape`); module-boundary enforcement is the team's concern (see "Boundary Enforcement"). `read_file`: `offset` is a 1-indexed line number clamped to ≥ 1, `limit` is a line count (values < 1 mean unbounded); default truncation is 2000 lines or 50 KiB whichever first, with a `[Truncated: showing X of Y lines (50 KiB limit)]` marker; non-UTF-8 bytes throw `unsupported_encoding`; other errors: `file_not_found`, `is_a_directory`, `permission_denied`, `i_o_error`. `write_file`: writes `content` verbatim, overwrites (idempotent, no append mode), auto-creates parent directories, caps content at 5 MiB (`file_too_large`); LLM-visible text is `Successfully wrote <N> bytes to <path>` — the summary alone, since the model just wrote the content and echoing a file-sized diff back wastes tokens (unlike `edit`, whose diff confirms a targeted change). `details: { kind: "diff", path, bytesWritten, createdAt, diff }`: `diff` is the shared unified-diff renderer's output against the previous content (all-added hunk for a new file, `""` when unchanged), `null` when the previous content is undecodable as UTF-8, exceeds 5 MiB, or either side exceeds 5000 lines — a TUI-only payload (`tui-layout.md`). Full rationale in ADR 9.

### edit

```typescript
edit(input: { path: string; edits: ReadonlyArray<{ old_string: string; new_string: string }>; replace_all?: boolean })
```

Search-and-replace inside a workspace text file. Every entry of `edits` is matched against the original file content — not against the result of earlier entries — and all replacements are applied in one atomic write. Each `old_string` must occur exactly once unless `replace_all` is true (`ambiguous_match` otherwise), and the entries' matched regions must be pairwise disjoint (`overlapping_edits` otherwise); zero occurrences throws `no_match`. With multiple entries the error detail names the offending one (`edits[i] of <path>`). The legacy single-pair form (`old_string`/`new_string` at the top level) is still accepted: the tool's `prepareArguments` shim rewrites it into a one-entry `edits` array before schema validation, and unwraps an `edits` value serialized as a JSON string. Matching is tolerant of encoding artifacts: a leading UTF-8 BOM is stripped for matching and restored on write, and both the file content and the `old_string`/`new_string` arguments are normalized to LF for matching; on write the file's detected original line ending (first CRLF vs LF occurrence wins) is restored throughout. On success `content` is a one-line ack (`Edited <path>: <n> replacement(s)`, n counting every applied replacement) — the model never sees the diff, keeping it out of subsequent LLM context; for files over 5000 lines the diff is omitted (use `write_file` for wholesale rewrites). `details: { kind: "diff", path, replacementsCount, beforeBytes, afterBytes, diff }` — the TUI renders the diff from the telemetry payload. Both tools share the unified-diff renderer: 3 context lines, hunks merged across gaps of ≤ 6 unchanged lines, `null` above the 5000-line cap. Same workspace/encoding errors as `read_file`, plus `disk_full` on write.

### kanban_write

```typescript
kanban_write(input: { cards: ReadonlyArray<KanbanCard> })

interface KanbanCard {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed";
  readonly active_form?: string;
}
```

Replaces (does not merge with) the agent's live kanban board; `status` is the card's column. The tool enforces: no duplicate `content`, no empty `content` — violations throw `kanban_write_invalid`. Any number of cards may be `in_progress` (the board's WIP is not limited); an empty list clears the board. `content` summarizes the card count and the in-progress count; `details: { kind: "kanban", cards }` carries the full board so the TUI renders it from the same payload.

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
| `user.prompt.dequeue` | `payload.teamId` and `payload.agentKey` match this body | remove the tail-most queued user prompt matching `prompt`; republish the queue snapshot |
| `user.prompt.requeue` | `payload.teamId` and `payload.agentKey` match this body | restore the most recently dequeued user prompt matching `prompt` to the queue's tail; republish the queue snapshot and drain |
| `user.effort.update` | none (broadcast) | apply the new effort to this body's agent |
| `user.model.update` | none (broadcast) | hot-swap this body's agent model when the soul does not pin one |
| `custom.{teamId}.{topic}` | one subscription per entry in `soul.subscribe`; events whose `sender.agentKey` equals the body's own key are dropped (self-receipt filter) | ingest peer notifications |

`isLeader` adds no subscription. The self-receipt filter lives in the body, not the bus: the transport is agent-identity-agnostic and a misbehaving subscriber cannot poison the publisher (per-subscriber error containment is in `03-event-system.md`).

Ingress formats the notification as a synthetic `user` message and feeds it to pi-agent:

| Source | Synthetic `user` content |
|---|---|
| `user.prompt` | `[user]: {prompt}` |
| `custom.{teamId}.{topic}` | `[{source_agent_key} on '{topic}']: {prompt}` — `topic` is the un-scoped name from the publisher's `notify` call |

A `user.prompt` ingress additionally stamps the raw entered text onto the synthetic message as a `displayText` field (`UserIngressMessage`); peer notifications carry none. It is persisted with the message and lets hydration recover the exact user text regardless of any transformation applied to the content (skill expansion, hook `additionalContext`) — so the display is not coupled to the LLM-facing content.

Every ingress message goes onto the body's FIFO in-memory queue (not persisted; lost on restart), then the body attempts a drain: when the agent is idle the head is handed to `agent.prompt()` as a new run; when the agent is streaming the entry stays queued and remains removable via `user.prompt.dequeue` until it is actually handed over. Mid-run, a healthy `turn_end` feeds the head via `agent.followUp()` so the queued prompt continues the same run; at `agent_end` the drain is deferred until pi has fully settled the run, and the head then starts a new run — entries never wait in pi's followUp queue across runs, which preserves arrival order and keeps dequeue race-free. Every enqueue and dequeue publishes `agent.prompt.queue.update` with `{ prompts: Array<{ text: string; source: "user" | "peer" }> }` — a snapshot of the pending entries: a queued user prompt appears as its raw user text (no `[user]: ` ingress prefix) tagged `"user"`, a peer notification as its synthetic text tagged `"peer"` — which the TUI renders as the queued-prompt indicator. The message a turn consumes rides on its `agent.turn.start` payload: the raw user text for a `user.prompt`-sourced turn, null for peer-notification and startup-resumed turns, so observers echo the prompt at consumption time, not at ingress.

**User dequeue.** On `user.prompt.dequeue` the body removes the queue's tail-most entry whose `source` is `"user"` and whose raw text equals `prompt`, then republishes `agent.prompt.queue.update` — always, even when nothing matched, so a stale observer resyncs against the authoritative snapshot. The removed entry is not dropped: it moves into a dequeued side-pile (keyed by raw text, constructed message intact) so a requeue can restore it. The side-pile is capped (32 entries, oldest evicted first): restoring an evicted entry misses and the snapshot republish resyncs observers, bounding the memory a long-lived body can hold for prompts it never requeues. Matching by text (not by id) makes the operation idempotent and race-free; only user entries are removable — peer notifications are display-only. The bus is in-process and synchronous, so the republished snapshot reaches observers before the publisher's dispatch call returns. The queue is intentionally unbounded in v1.

**User requeue.** On `user.prompt.requeue` the body pops the side-pile's tail-most entry whose raw text equals `prompt` and pushes the original constructed message back onto the queue's tail — no hook or skill expansion runs again — then republishes the snapshot (again even on a miss) and drains, so an idle agent starts the restored prompt as a new run immediately. A fresh `user.prompt` whose raw text matches a side-pile entry discards that entry: the user resubmitted the text through the editor, so the new ingress supersedes the parked one.

**Effort update.** On `user.effort.update` (broadcast, published by the `setDefaultEffort` command after persisting the setting) every body sets `agent.state.thinkingLevel` from the new effort (`max` → `xhigh`, others pass through); pi-agent reads `thinkingLevel` on each LLM call, so the change takes effect on the body's next call without restart. When the body has a model assigned it also updates `ModelInfo.effort` and republishes `agent.model.assigned`, so observers (the TUI footer) resync; `identity.model` reflects the live effort. The soul cannot pin an effort today — every body inherits the default — so the subscription is unconditional; a future manifest-pinned effort would filter here.

**Model update.** On `user.model.update` (broadcast, published by the `setDefaultModel` command after persisting the setting) a body whose soul does not pin a model (`soul.model === ""`) resolves the `provider`/`modelId` reference through the model registry, sets `agent.state.model` to the resolved model, and republishes `agent.model.assigned` carrying the current effort and the new model's `contextWindow`; pi-agent reads `state.model` on each LLM call, so the swap takes effect on the next call without restart. Bodies whose soul pins a model ignore the update — mirroring the load-time precedence where the soul's `model:` wins over settings ("Model Resolution" in 10-configuration.md) — and an unresolvable reference is a silent no-op, mirroring the non-leader soul-skip at load. `agent.model.assigned` carries `contextWindow` on every publish (construction, effort, and model updates alike) so observers track the window of the model actually assigned.

A `user.prompt` first runs the `UserPromptSubmit` hook (10-configuration.md "Hooks") before the queue/dispatch decision: a block drops the prompt and publishes `system.error` with the reason, and a non-null `additionalContext` is appended to `{prompt}`. Peer notifications (`custom.*`) do not run this hook. Because the hook may block, prompt ingress is asynchronous.

**Skill invocation.** After the hook, a `user.prompt` that begins with `/skill:<name>` is expanded against the body's resolved skills before dispatch (`expandSkillInvocation`, `10-configuration.md` "Invocation"): the prompt becomes a `<skill name location>` block carrying the skill body — the args interpolated into `$ARGUMENTS`/`$n` placeholders when the body has any, otherwise appended after the block — and that expanded text is what `{prompt}` carries into the synthetic `[user]:` message (and thus memory). Expansion is a no-op when the name matches none of this agent's skills — the text passes through unchanged. The raw prompt (not the expansion) is what rides the `agent.turn.start` payload and is shown as the turn's user text, and it is the raw prompt the `UserPromptSubmit` hook sees. Skills resolve once at body construction, so `/reload` (which rebuilds bodies) picks up edited skill files.

## AgentBody

The public contract:

```typescript
interface AgentBody {
  readonly identity: AgentInfo;   // { teamId, role, agentKey, isLeader, tools, subscribe, skills, model }
  start(): Promise<void>;
  stop(): void;
}
```

The `agentBodyFactory` cradle entry (registered in `core/module.ts`, invoked by `TeamManager` on team load and reload) builds the single concrete implementation: per-body `AgentBodyParams` (`agentKey`, `teamId`, `soul`, `isLeader`, `sessionId`, `effort`, and the resolved pi-ai `Model`) plus cradle-scoped deps (`eventManager`, `artifactStore`, `memoryManager`, `toolRegistry`, `skillManager`, the `loadSystemContextBlock` loader invoked per body, `hookRunner`, `cwd`, `getApiKey` and `resolveModel` derived from the model registry); the factory also constructs one shared `Compactor` over the `memoryManager` for all bodies ("Compaction" below; session identity travels per `compact` call). No inheritance — the body wraps pi-agent-core's `Agent`, which owns the LLM loop, tool execution, streaming, and context transformation. The soul is immutable; the body is the only publisher on the bus.

**`start()` ordering.** (1) Register the subscriptions above and fire the `SessionStart` hook (once per body — `start()` is idempotent; 10-configuration.md "Hooks"). (2) `memory.restore(agentKey, sessionId, teamId)` and push the rows into `agent.state.messages`. (3) If the restored history ends with a `user` or `toolResult` message, `agent.continue()` to resume the in-flight turn. (4) Drain anything that arrived on subscribed topics during startup via `agent.prompt()`. The body does not publish `agent.idle` at startup — a body that has never run a turn is idle by default. `stop()` unsubscribes everything.

**Agent construction.** The `Agent` is created with `sessionId`, `getApiKey`, an identity `transformContext` (compaction never runs inside pi-agent — "Compaction" below), pi-agent-core's `convertToLlm` (a `compactionSummary` message enters the LLM request as a `user` message whose text wraps the summary in `<summary>` tags), `steeringMode: "all"`, `followUpMode: "all"`, `toolExecution: "sequential"`, and the telemetry hooks below. The body then sets `agent.state.systemPrompt` via `composeSystemPrompt` (the shared context-files block, then the soul's prose, then the resolved skills block), `agent.state.model` (publishing `agent.model.assigned` when a model is assigned), and `agent.state.tools` (the adapted `AgentTool[]`).

### Event Bridging

The body subscribes to pi-agent's `AgentEvent` stream and bridges to the bus:

| pi-agent event | Bus event |
|---|---|
| `turn_start` | `agent.turn.start` — deferred to the turn's next pi event and published before that event; payload is the prompt this turn consumes (raw user text for a `user.prompt`, null otherwise), resolved from the body's pending dispatch for a `prompt()`-started turn or from a label keyed by the supplied message for a `followUp()`-fed turn, consumed once |
| `message_start`, `message_update`, `message_end` (assistant) | streaming pipeline → `agent.stream.chunk` / `agent.stream.end`; assistant `message_end` also publishes `agent.usage` when the message carries usage |
| `message_end` (every role) | `memory.persist(message, agentKey, sessionId, teamId)` — unconditional, no role check; a `toolResult` message is projected first: its `details` is dropped unless `kind` is `"diff"` or `"kanban"` (see Memory Integration) |
| `turn_end` | on a healthy turn (final `stopReason` not `error`/`aborted`), dequeue one queued message via `agent.followUp()` to continue this run; publish `agent.prompt.queue.update` |
| `agent_end` | `agent.idle` with the final `stopReason`; also `system.error` when the run ended `error`/`aborted` with a message; fire the `Stop` hook; then defer until pi settles the run — the compaction check runs first ("Compaction" below), then the queue head starts a new run via `agent.prompt()` (an error/aborted `turn_end` feeds nothing, so its queued entries survive to this drain) |
| `agent_start`, `tool_execution_*` | not bridged — tool telemetry comes from the `beforeToolCall`/`afterToolCall` hooks |

**Streaming.** `message_update` text/thinking deltas buffer per block type and flush as `agent.stream.chunk` `{ stream_id, seq, block_type, text }` at ≥ 64 chars or on a 200ms timer (a block-type change flushes the prior buffer first); the assistant `message_end` flushes the remainder and publishes `agent.stream.end` `{ stream_id, total_chunks, thinking_durations }`, where `thinking_durations` carries each thinking segment's duration measured at this edge, in segment order (empty when the stream carried no thinking).

**Tool telemetry hooks.** `beforeToolCall` publishes `agent.tool.call` `{ tool_call_id, name, input, input_truncated }`; `afterToolCall` publishes `agent.tool.result` `{ tool_call_id, name, output, output_truncated, duration_ms, error, details }`. `tool_call_id` is pi-agent's provider-defined id passed through as-is — the same string in both events is the correlation key for observers. `output` serializes the whole Jie `ToolResult` (content, details, terminate), not just the LLM-visible text, and `details` is additionally carried first-class in the payload. Both text fields are middle-truncated to 4 KiB (`EVENT_TEXT_TRUNCATION_BYTES`, marker `...[N chars truncated]...`) — events only; the LLM always sees untruncated tool input and output. Both events are observer-only: no agent subscribes to them. The same two seams run the user's command hooks (10-configuration.md "Hooks"): `beforeToolCall` runs `PreToolUse` after publishing telemetry — a block prevents execution and the agent receives an error tool result carrying the reason; `afterToolCall` runs `PostToolUse` — a block replaces the result with an error result, and `additionalContext` is appended to the result content. Telemetry is published regardless of hook outcome.

### Agent Loop and Termination

A prompt drives one pi-agent run: think → optionally call tools → think → … until the LLM's `stopReason` is `stop`, `length`, `error`, or `aborted` (`toolUse` continues the loop). The platform adds no turn budgets and no grace turn: `notify` is a regular tool the LLM calls when its system prompt instructs it to, and `ToolResult.terminate` is handled natively by pi-agent (stop after the batch) without platform interpretation (ADR 6). Bodies process their own queues serially; pipeline seriality (one agent active per task) falls out of the team's subscription graph, not a platform mechanism. Error resolution is LLM reasoning over tool-result text — agents are not crash-and-restart components.

## Memory Integration

Three facts belong here; the full contract is canonical in `08-memory.md`.

- **Write-through persist.** Every pi-agent `message_end` → `memory.persist(...)` to SQLite, unconditionally (no role check, no buffering). Before persisting, the body projects a `toolResult` message to its persistable form: `details` is dropped unless `kind` is `"diff"` or `"kanban"` — those two are TUI display payloads (diff view, kanban panel) that hydration reads back; every other kind serves only hooks and live telemetry, which never read stored rows. The live message in pi-agent state is not mutated, so same-process history and `agent.tool.result` events keep the full payload.
- **Session identity.** The `sessionId` is minted per process run × team by the platform (`TeamManager`) and passed to the body (ADR 17); all agents of one team in one process share it. `jie --resume <id>` validates via `memory.hasSession` and fails hard with `unknown_session` on a miss. `restore()` on `start()` returns the prior rows for `(teamId, agentKey, sessionId)`; a fresh session restores empty.
- **Compaction.** Between runs the body's `Compactor` may rewrite the stored history to a summary plus a recent tail (`08-memory.md` "Compact"); on success the body applies the same rewrite in memory — `agent.state.messages` becomes `[summaryMessage, ...messages.slice(firstKeptIndex)]`. Because the `Agent` was constructed with `convertToLlm`, the surviving `compactionSummary` message enters the next LLM request as a `user` message carrying the summary — whether it was just written or restored on `start()`.

### Compaction

The body owns compaction triggering; pi-agent's own path (`CompactionSettings` inside `transformContext`) never runs — the body passes an identity `transformContext`. The `agentBodyFactory` constructs one shared `Compactor` over the `memoryManager` for all bodies — it carries no per-body state; each `compact` call includes the body's identity (`agentKey`, `sessionId`, `teamId`), which the Compactor forwards to `memory.compact`. The contract is `compact(input): Promise<CompactionResult | null>` — `null` means nothing was compacted (below threshold, nothing summarizable, or no model assigned).

Decision flow inside `compact`, built on `@earendil-works/pi-agent-core` toolkit functions with `DEFAULT_COMPACTION_SETTINGS`:

1. **Threshold.** Estimate the context tokens of the history since the last summary; proceed only when they exceed `contextWindow - reserveTokens` (`shouldCompact`). The estimate prefers the last assistant message's usage info and falls back to character-based estimation; a freshness guard re-estimates from characters when the usage message predates the current summary (restored histories).
2. **Cut point.** Walk backwards accumulating estimated tokens until `keepRecentTokens` is covered, then snap the cut to the first `user`/`assistant` boundary at or after that index — `toolResult` and `compactionSummary` messages are never cut points. `null` when the prefix before the cut is empty or consists solely of prior summaries.
3. **Summarize.** Before the LLM call the Compactor verifies that the stored non-compacted row count equals the in-memory history length (the two are kept symmetric by write-through persist and identical rewrites); a mismatch throws rather than marking the wrong rows. Then one assistant call with a summarization system prompt over the serialized prefix; when a previous summary exists it is passed along and the prompt asks to update it rather than rewrite. The response becomes a `compactionSummary` message (`createCompactionSummaryMessage`), persisted via `memory.compact(firstKeptIndex, ...)`.

Two trigger points, both single-flight (a concurrent trigger awaits the in-progress compaction): after a run settles (`agent_end` → `waitForIdle`; the settled cycle then dispatches the queue head without re-checking) and as a safety net immediately before dispatching a queued prompt from ingress. A body with no model never compacts. `stop()` aborts an in-flight summarization. A summarization failure publishes `system.error` (`compaction failed: <message>`) and leaves the history untouched — the failure never blocks the queue; the next trigger retries. The compaction rewrite is not published on the event bus — live TUI conversation views keep showing the pre-compaction messages until the next hydration (`tui-overview.md`, out-of-band oblivious).

## Boundary Enforcement (Platform vs Team)

The platform's file tools — `read_file`, `write_file`, `edit`, and `bash`'s `workdir` — enforce **workspace-root containment only**: the resolved absolute path must stay inside the resolved workspace root, or a typed `path_escape` / `workdir_escape` error results. They do not enforce module boundaries, no-new-exports rules, or any team-defined constraint (ADR 9):

| Layer | Enforces | Status |
|---|---|---|
| Platform file tools | "inside the workspace root" | v1 |
| Team blueprint (role system prompt, or a wrapper tool the team defines) | "inside the allowed module boundary" | Day 2, team-owned |

Consequence: in v1 an agent with `write_file` can write any file inside the workspace root, including files in a sealed module. Preventing that is the team layer's contract, by design.
