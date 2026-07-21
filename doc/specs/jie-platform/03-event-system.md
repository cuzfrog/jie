# Event System

Jie's event system is the in-process pub/sub backbone. `AgentBody` bridges pi-agent's internal events (see `pi-agent-api-reference.md`) onto typed topics; the CLI and TUI observe those topics and publish user input back. Everything runs in one process — there is no network transport.

## Envelope and Topics

Every event is a frozen `EventEnvelope` constructed through the `Events` factory — there is no other constructor:

```typescript
interface EventEnvelope<T extends EventType> {
  readonly version: 1;
  readonly type: T;            // the event type, e.g. "agent.tool.call"
  readonly topic: string;      // the bus subject: the type string, or `custom.${clientTopic}`
  readonly sender: Sender;
  readonly timestamp: string;  // ISO 8601
  readonly payload: ...;       // per-type, see below
}

type Sender =
  | { readonly kind: "agent"; readonly teamId: string; readonly agentKey: string }
  | { readonly kind: "user" }
  | { readonly kind: "system" };
```

Identity travels in the envelope, not in the subject. `topic` equals `type` for every platform event; only client-defined topics get a distinct subject (`custom.${clientTopic}`).

| Topic | Sender | Payload |
|---|---|---|
| `agent.turn.start` | agent | `null` |
| `agent.idle` | agent | pi-ai `StopReason` (`"stop"` / `"length"` / `"error"` / `"aborted"`) |
| `agent.tool.call` | agent | `{ tool_call_id, name, input, input_truncated }` |
| `agent.tool.result` | agent | `{ tool_call_id, name, output: string \| null, output_truncated, duration_ms, error: string \| null, details }` |
| `agent.stream.chunk` | agent | `{ stream_id, seq, block_type: "text" \| "thinking", text }` |
| `agent.stream.end` | agent | `{ stream_id, total_chunks }` |
| `agent.usage` | agent | `{ input, output, cacheRead, cacheWrite, totalTokens }` |
| `agent.prompt.queue.update` | agent | `{ prompts: string[] }` |
| `agent.model.assigned` | agent | `{ provider, model, effort }` |
| `user.prompt` | user | `{ teamId, agentKey, prompt }` |
| `agent.interrupt` | any | `{ teamId, agentKey }` |
| `system.team.loaded` | system | `TeamInfo` — `{ id, leaderKey, agents: [{ teamId, role, agentKey, isLeader, model }] }` |
| `system.error` | system | `{ error: string }` |
| `custom.${clientTopic}` | agent | `{ message: string, truncated: boolean }` |

`system.team.loaded` is published once per team load (by `TeamManager.load`) and is the boot roster signal; `system.error` carries agent-loop failures (the CLI prints them).

## EventManager and the Events factory

`EventBus` (`event/event-bus.ts`) is the internal transport primitive. External consumers use the type-safe `EventManager`:

```typescript
interface EventManager {
  publish<T extends EventType>(event: EventEnvelope<T>): void;              // routes on event.topic
  subscribe<T extends EventType>(topic: T, cb: (e: EventEnvelope<T>) => void): () => void;
  subscriberCount(subject: string): number;                                  // used by notify
}
```

`createEventManager(bus?)` owns an in-process bus by default; tests may pass an explicit bus. `JiePlatform` wraps the manager: `handle.subscribe(topic, cb)` is the consumer surface (ADR 13) — the bus never reaches consumer code.

Each known type has a flat-args factory method (`Events.agentTurnStart(sender)`, `Events.agentIdle(sender, stopReason)`, `Events.userPrompt(sender, teamId, prompt, agentKey)`, `Events.teamLoaded(sender, teamInfo)`, …). `Events.custom(sender, clientTopic, message)` is the client-topic factory: the bus subject becomes `custom.${clientTopic}`.

## Subscription model

Each `AgentBody` subscribes to exactly:

- `"user.prompt"` — filtered on `payload.agentKey === own agentKey`; this is the sole user prompt ingress (CLI `-p` and TUI both publish here via `handle.prompt(teamId, agentKey, text)`). There are no per-agent subjects and no leader-only ingress.
- `"agent.interrupt"` — filtered on `teamId` + `agentKey`.
- `custom.${teamId}.${topic}` for each entry of the soul's `subscribe:` frontmatter.

The team author writes **unscoped** topic names in `.md` frontmatter and in `notify` calls (`task.recorded`, another agent's key for direct addressing); the platform applies the `custom.${teamId}.` prefix at body construction (subscriptions) and at publish time (`notify` → `Events.custom`). Self-receipts are filtered in the body's callback by matching the sender's `agentKey` against its own — the bus stays identity-agnostic.

Multiple teams' bodies coexist on the same bus; `teamId` in senders and payloads disambiguates. `session_id` never appears on the bus — it is internal to the body and the memory subsystem (`08-memory.md`).

## Streaming

LLM output originates from pi-agent's `message_update` deltas. The body buffers per `block_type` (`"text"` / `"thinking"`; tool-call deltas are not streamed) and publishes `agent.stream.chunk`; `stream_id` is a per-LLM-invocation counter, `seq` the chunk ordinal. On `message_end` the remaining buffer flushes and `agent.stream.end` follows. Flush triggers: `stream_chunk_size` chars (64), `stream_flush_ms` (200 ms), or a `block_type` change — tunables in `10-configuration.md` "Streaming Tunables"; the body-side pipeline is in `06-agent-model.md`.

## Tool Telemetry and Truncation

Every tool call emits `agent.tool.call` before execution and `agent.tool.result` after. `tool_call_id` is pi-agent's opaque id from its `beforeToolCall` / `afterToolCall` hooks, passed through verbatim so observers can correlate the pair. `output` is the whole `ToolResult = { content, details?, terminate? }` JSON-serialized (undefined fields dropped by `JSON.stringify`); on a thrown `execute`, `output` is `null` and `error` carries the message.

`Events` factory truncates `agent.tool.call.input`, `agent.tool.result.output`, and `custom` messages at `EVENT_TEXT_TRUNCATION_BYTES` (4096) with **middle truncation**: head and tail preserved, marker `...[N chars truncated]...` at the cut, and the `*_truncated` / `truncated` flag set. Other event payloads are bounded by their upstream contracts and are not truncated.

## Event-Order Contract

**Body-side alternation.** Per body, `agent.turn.start` and `agent.idle` strictly alternate: exactly one `agent.turn.start` per pi-agent `turn_start`, exactly one `agent.idle` per `agent_end` (regardless of `stopReason`), start always before idle for the same turn. A body that has not started any turn has published nothing — observers treat it as **idle by default**; the "this agent exists" signal at boot is `system.team.loaded`, not a startup `agent.idle`.

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

`InProcessEventBus` is a `Map<string, Set<callback>>`: publish invokes callbacks synchronously in subscription order; unsubscribe removes the callback; `subscriberCount` returns the set size. Error containment is per callback: a throwing subscriber is caught and logged via the platform logger (subject + error), dispatch continues to the remaining subscribers, and the publisher never sees the exception.
