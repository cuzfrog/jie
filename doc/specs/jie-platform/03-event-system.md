# Event System

Jie's event system is the in-process pub/sub backbone. `AgentBody` bridges pi-agent's internal events (see `pi-agent-api-reference.md`) onto typed topics; the CLI and TUI observe those topics and publish user input back. Everything runs in one process — there is no network transport.

## Envelope and Topics

Each event is a frozen `EventEnvelope` (defined in `event/events.ts`, the only constructor) with fields:

- `version: 1`, `type` (the event type), `topic` (the bus subject: the type string for platform events, or `custom.${teamId}.${topic}` for client topics), `sender`, `timestamp` (ISO 8601), `payload`.
- `sender` is `{ kind: "agent", teamId, agentKey } | { kind: "user" } | { kind: "system" }`.

Identity travels in the envelope, not in the subject. `topic` equals `type` for every platform event; only client-defined topics get a distinct subject (`custom.${clientTopic}`).

| Topic | Sender | Payload |
|---|---|---|
| `agent.turn.start` | agent | `string \| null` — the raw user text this turn consumes; null for peer-notification and startup-resumed turns. Published only when the `turn_start` carries a new user message (new prompt, follow-up, or peer notification); a `turn_start` with no new user message publishes `agent.turn.continue` instead |
| `agent.turn.continue` | agent | `null` - the run continues past a `turn_end` into the next `turn_start` with no new user message (tool-use loop, automatic continuation); the current conversation turn is not rotated |
| `agent.idle` | agent | pi-ai `StopReason` (`"stop"` / `"length"` / `"error"` / `"aborted"`) |
| `agent.tool.call` | agent | `{ tool_call_id, name, input, input_truncated }` |
| `agent.tool.result` | agent | `{ tool_call_id, name, output: string \| null, output_truncated, duration_ms, error: string \| null, details: ToolResultDetails \| null }` — `details` is the closed tool-details union (`06-agent-model.md` "Tool") |
| `agent.stream.chunk` | agent | `{ stream_id, seq, block_type: "text" \| "thinking", text }` |
| `agent.stream.end` | agent | `{ stream_id, total_chunks, thinking_durations: number[] }` |
| `agent.usage` | agent | `{ input, output, cacheRead, cacheWrite, totalTokens }` |
| `agent.prompt.queue.update` | agent | `{ prompts: Array<{ text: string; source: "user" \| "peer" }> }` |
| `agent.model.assigned` | agent | `{ provider, model, effort, contextWindow: number \| null }` |
| `agent.compacted` | agent | `{ summary, tokens_before, summarized_prompts }` — published after a successful compaction rewrite (mid-run between turns as well as between runs): the summary text, the context tokens before the cut, and the count of `user`-role messages in the summarized prefix (`06-agent-model.md`, "Compaction") |
| `user.prompt` | user | `{ teamId, agentKey, prompt }` |
| `user.prompt.dequeue` | user | `{ teamId, agentKey, prompt }` — cancel the most recently queued user prompt whose raw text equals `prompt` |
| `user.prompt.requeue` | user | `{ teamId, agentKey, prompt }` — restore the most recently dequeued user prompt whose raw text equals `prompt` to the queue's tail |
| `user.effort.update` | user | `{ effort }` — broadcast a new default effort; every live body applies it (`06-agent-model.md`) |
| `user.model.update` | user | `{ provider, modelId }` — broadcast a new default model; every live body whose soul does not pin a model applies it (`06-agent-model.md`) |
| `agent.interrupt` | any | `{ teamId, agentKey }` |
| `system.team.loaded` | system | `TeamInfo` — `{ id, leaderKey, agents: [{ teamId, role, agentKey, isLeader, tools, subscribe, skills, model }] }` |
| `system.error` | system | `{ error: string }` |
| `custom.${clientTopic}` | agent | `{ message: string, truncated: boolean }` |

`system.team.loaded` is published once per team load (by `TeamManager.load`) and is the boot roster signal; `system.error` carries agent-loop failures (the CLI prints them).

## EventManager and the Events factory

`EventBus` (`event/event-bus.ts`) is the internal transport primitive. External consumers use the type-safe `EventManager` (`event/event-manager.ts`); `EventManagerImpl` takes the `eventBus` cradle entry (an in-process bus by default, registered alongside it by `registerEventModule`); tests register a mock bus. `JiePlatform` wraps the manager — `handle.subscribe(topic, cb)` is the consumer surface (ADR 13) — the bus never reaches consumer code. The `Events` factory in `event/events.ts` is the only way to build typed envelopes: flat-args factories per type (`Events.agentTurnStart/Continue`, `Events.agentIdle`, `Events.agentToolCall/Result`, `Events.agentStreamChunk/End`, `Events.agentUsage`, `Events.agentPromptQueueUpdate`, `Events.agentModelAssigned`, `Events.agentCompacted`, `Events.agentCompactionStart/End`, `Events.userPrompt[Dequeue|Requeue]`, `Events.userEffortUpdate/ModelUpdate`, `Events.teamLoaded`, `Events.systemError`, `Events.agentInterrupt`, `Events.custom`). `Events.custom(sender, clientTopic, message)` is the client-topic factory: the bus subject becomes `custom.${clientTopic}`.

## Subscription model

Each `AgentBody` subscribes to exactly:

- `"user.prompt"` — filtered on `payload.agentKey === own agentKey`; this is the sole user prompt ingress (CLI `-p` and TUI both publish here via `handle.prompt(teamId, agentKey, text)`). There are no per-agent subjects and no leader-only ingress.
- `"agent.interrupt"` — filtered on `teamId` + `agentKey`.
- `"user.prompt.dequeue"` — filtered on `teamId` + `agentKey`; removes the queue's tail-most user entry matching the text and republishes `agent.prompt.queue.update` (even on a miss, resyncing stale observers). Peer notifications cannot be dequeued (`06-agent-model.md`).
- `"user.prompt.requeue"` — filtered on `teamId` + `agentKey`; restores the most recently dequeued user entry matching the text to the queue's tail, republishes `agent.prompt.queue.update`, and drains — an idle agent starts the restored prompt immediately (`06-agent-model.md`).
- `"user.effort.update"` — unfiltered (broadcast); every body applies the effort to its agent and, when a model is assigned, republishes `agent.model.assigned` with the new effort (`06-agent-model.md`).
- `"user.model.update"` — unfiltered (broadcast); every body whose soul does not pin a model resolves the reference and hot-swaps its agent's model, republishing `agent.model.assigned` (`06-agent-model.md`).
- `custom.${teamId}.${topic}` for each entry of the soul's `subscribe:` frontmatter.

The team author writes **unscoped** topic names in `.md` frontmatter and in `notify` calls (`task.recorded`, another agent's key for direct addressing); the platform applies the `custom.${teamId}.` prefix at body construction (subscriptions) and at publish time (`notify` → `Events.custom`). Self-receipts are filtered in the body's callback by matching the sender's `agentKey` against its own — the bus stays identity-agnostic.

Multiple teams' bodies coexist on the same bus; `teamId` in senders and payloads disambiguates. `session_id` never appears on the bus — it is internal to the body and the transcript store (`08-transcript.md`).

## Streaming

LLM output originates from pi-agent's `message_update` deltas. The body buffers per `block_type` (`"text"` / `"thinking"`; tool-call deltas are not streamed) and publishes `agent.stream.chunk`; `stream_id` is a per-LLM-invocation counter, `seq` the chunk ordinal. On `message_end` the remaining buffer flushes and `agent.stream.end` follows, carrying `thinking_durations` — one duration per thinking segment in that stream, in segment order, measured at the streaming edge (`Date.now()` around each thinking block; empty when the stream had no thinking). Flush triggers: `stream_chunk_size` chars (64), `stream_flush_ms` (200 ms), or a `block_type` change — tunables in `10-configuration.md` "Streaming Tunables"; the body-side pipeline is in `06-agent-model.md`.

## Tool Telemetry and Truncation

Every tool call emits `agent.tool.call` before execution and `agent.tool.result` after. `tool_call_id` is pi-agent's opaque id from its `beforeToolCall` / `afterToolCall` hooks, passed through verbatim so observers can correlate the pair. `output` is the whole `ToolResult = { content, details?, terminate? }` JSON-serialized (undefined fields dropped by `JSON.stringify`); on a thrown `execute`, `output` is `null` and `error` carries the message.

`Events` factory truncates `agent.tool.call.input`, `agent.tool.result.output`, and `custom` messages at `EVENT_TEXT_TRUNCATION_BYTES` (4096) with **middle truncation**: head and tail preserved, marker `...[N chars truncated]...` at the cut, and the `*_truncated` / `truncated` flag set. Other event payloads are bounded by their upstream contracts and are not truncated; `agent.compacted.summary` is the exception — LLM output bounded only by the summarization `maxTokens`, it passes through untruncated so the TUI marker matches the persisted summary row.

## Event-Order Contract

**Body-side alternation.** Per body, `agent.turn.start` and `agent.idle` strictly alternate: exactly one of `agent.turn.start` or `agent.turn.continue` per pi-agent `turn_start`, exactly one `agent.idle` per `agent_end` (regardless of `stopReason`), start always before idle for the same turn. `agent.turn.start` carries a new user message (new prompt, follow-up, or peer notification); `agent.turn.continue` marks a continuation `turn_start` with no new user message (tool-use loop) - the run stays in the same conversation turn. A body that has not started any turn has published nothing — observers treat it as **idle by default**; the "this agent exists" signal at boot is `system.team.loaded`, not a startup `agent.idle`. The turn-start publication is deferred from pi's `turn_start` (which carries no prompt identity) to the turn's next pi event, where the body resolves whether a new user message is present: a `message_start(user)` publishes `agent.turn.start` (consuming the queue label), any other flushing event publishes `agent.turn.continue`. the deferred publication precedes all of the turn's own events on the bus, so the ordering above holds.

**Bus-side in-order delivery.** `InProcessEventBus` dispatches synchronously in subscription order, so per-body event order is preserved end-to-end.

**Why it matters.** Observers run per-body busy/idle state machines. The CLI's `-p` idle gate is a busy counter over `agent.turn.start` / `agent.idle`; without the alternation, a body could go from "no event seen" straight to `idle` and open the gate without ever being observed busy. With synchronous in-order delivery, at least one agent is always seen as busy while work passes between agents — e.g. A notifies B; B's `turn.start` is delivered inside A's `notify` call, before A's own `idle`. Any observer follows the same pattern: subscribe to the two topics, keep per-body state, treat absence of events as idle.

## Observability

There is no separate monitoring pipeline — observers (TUI, `-p` mode, diagnostics) subscribe to platform events:

| Observer state | Derived from |
|---|---|
| Agent is alive | its `(role, agentKey)` appears in a `system.team.loaded` for the team |
| Agent is busy | `agent.turn.start` seen with no following `agent.idle` |
| Agent is idle | default; or `agent.idle` seen with no following `agent.turn.start` |
| Live output / tool telemetry / queue / model | `agent.stream.chunk` / `agent.tool.call` + `agent.tool.result` / `agent.prompt.queue.update` / `agent.model.assigned` |
| Agent errored | `system.error`, or a team-defined domain event carrying an error string via `notify` |

The alternation contract is what makes the busy/idle rows reliable. Queue-pickup flicker (a brief `idle` between two queued prompts) is an observer-side debounce concern (`doc/specs/ui/tui-state.md`), not a platform one. Everything is in-process, so there is no missed-event or partition concern.

## In-Process Implementation

`InProcessEventBus` is a `Map<string, Set<callback>>` (`event/event-bus.ts`): publish invokes callbacks synchronously in subscription order. Per-callback error containment — a throwing subscriber is caught and logged (subject + error), dispatch continues, the publisher never sees the exception.
