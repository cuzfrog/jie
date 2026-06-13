# Event System

Jie's EventBus is the in-process pub/sub backbone. pi-agent's internal events (see `pi-agent-api-reference.md`) are bridged to these subjects by `AgentBody`.

## Transport

The `EventBus` interface has two implementations:

| Impl | Used when | Characteristics |
|---|---|---|
| **In-process** (v1 default) | Default — agents and TUI share one OS process | Synchronous callback dispatch, no serialization overhead, no network dependency. |
| **NATS** (future) | Multi-process deployments, distributed agents | Network transport, durable streams (JetStream), multi-team isolation. |

The in-process implementation is the v1 default. NATS is a pluggable transport for Day 2 — the `EventBus` interface is the same, only the constructor changes.

## EventBus Interface

```typescript
interface EventBus {
  publish(subject: string, payload: object): void;
  subscribe(subject: string, callback: (subject: string, payload: object) => void): () => void;
  subscriberCount(subject: string): number;
}
```

- `publish` — fire-and-forget. Synchronous callback dispatch in-process; async flush in NATS mode.
- `subscribe` — returns an unsubscribe function. Callbacks are invoked in publish order within a subject.
- `subscriberCount` — returns the number of active callbacks subscribed to a subject. Used by `notify` to report recipient count.
- No `request` method — request-reply is an application-layer concern built on pub/sub.

## Subject Schema

```
leader.prompt                        — prompt ingress from TUI or -p mode
{agent_key}                          — direct-addressing channel (every agent auto-subscribes to its own)
{domain_topic}                       — team-defined domain events (e.g. task.recorded, task.researched)
agent.stream.chunk                   — batched LLM output (all agents)
agent.stream.end                     — LLM response complete
agent.tool.call                      — tool invocation about to execute
agent.tool.result                    — tool execution completed
agent.queue.update                   — agent's in-memory prompt queue changed (enqueue or dequeue)
agent.turn.start                     — agent began a turn (pi-agent `turn_start` bridged to bus; used by `-p` mode for all-agents-idle detection)
agent.idle                           — agent entered idle state (replaces heartbeat)
```

- `agent_key` — persistent agent identity: `{role}-{N}` (e.g. `leader-1`, `researcher-1`). Every agent auto-subscribes to its own `agent_key` at startup. Used for direct inter-agent addressing via `notify`.
- `domain_topic` — dotted string defined by the team blueprint (e.g. `task.recorded`, `work.researched`, `task.completed`). Agents subscribe via `subscribe:` in their `.md` frontmatter. The platform is agnostic of topic semantics.
- The leader additionally auto-subscribes to `leader.prompt` for user input ingress.

No `team_id` prefix — one process runs one team. Multi-team isolation is a Day 2 concern.

No `session_id` in subjects — one process run is one session. `session_id` is internal to AgentBody and the Memory subsystem (see `08-memory.md`) where it partitions durable conversation history per process run. It is not published on the event bus.

## Event Envelope

```typescript
interface AgentEvent<T extends string = string> {
  version:     1;           // envelope format version
  event_type:  T;
  agent_role:  string;      // team-defined role identifier
  agent_key:   string;      // persistent slot identity: {role}-{N}
  timestamp:   string;      // ISO 8601
  payload:     Record<string, unknown>;
}
```

`payload` is a discriminated union keyed on `event_type`. The platform defines infrastructure event payloads; the team blueprint defines domain event payloads.

### Platform Event Payloads

```typescript
type PlatformEventPayload<T extends PlatformEventType> =
  T extends 'leader.prompt'        ? { prompt: string } :
  T extends 'agent.stream.chunk'   ? { stream_id: number; seq: number; text: string } :
  T extends 'agent.stream.end'     ? { stream_id: number; total_chunks: number } :
  T extends 'agent.tool.call'      ? { tool_call_id: string; name: string; input: string; input_truncated: boolean } :
  T extends 'agent.tool.result'    ? { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null } :
  T extends 'agent.queue.update'   ? { prompts: string[] } :
  T extends 'agent.turn.start'     ? { } :
  T extends 'agent.idle'           ? { } :
  // Topic-published events carry domain-defined payloads:
  T extends string                 ? { prompt: string; source: string } :
  never;
```

**Type-narrowing boundary.** The platform's `PlatformEventPayload` falls through to `{ prompt, source }` for any string `T` that is not a platform event. This is a deliberately permissive shape — the platform does not validate domain event payloads. The actual domain event payload types are defined by the team blueprint and consumed by its roles via their LLM context. The platform treats all domain events as opaque `{ prompt, source }` for envelope purposes; the LLM in the receiving agent parses the payload from the synthetic `user` message. The platform's only validation is the envelope (version, agent_role, agent_key, timestamp) and the platform's own event payloads.

type PlatformEventType =
  | 'leader.prompt'
  | 'agent.stream.chunk'
  | 'agent.stream.end'
  | 'agent.tool.call'
  | 'agent.tool.result'
  | 'agent.queue.update'
  | 'agent.turn.start'
  | 'agent.idle';
```

> Domain event types and payloads are defined by the team blueprint.

## Streaming

LLM output originates from pi-agent's `message_update` events (per-token deltas). Jie buffers and publishes `agent.stream.chunk` on its EventBus:

- **Source**: pi-agent's `agent.subscribe(listener)` receives `message_update` events. Each carries an `assistantMessageEvent` with text/thinking/tool_call delta content.
- **Buffering**: Jie accumulates delta text. Flush when buffer reaches **64 characters** or **200 ms** elapsed since first buffered token.
- **Publish**: `agent.stream.chunk` — `{ stream_id, seq, text }`. `stream_id` is a per-LLM-invocation counter; `seq` is the chunk ordinal within that stream.
- **Completion**: On `message_end` (assistant response finalized), flush remaining buffer, publish final chunk, then publish `agent.stream.end` with `{ stream_id, total_chunks }`.

Tunables (`stream_chunk_size`, `stream_flush_ms`) are in `10-configuration.md`. The TUI and `-p` mode consume these events. See `06-agent-model.md` pi-agent Integration Contract for the full event bridging table.

## Tool Telemetry

Every tool call emits two events:

- `agent.tool.call` — before execution. `input` is JSON-serialized; truncated at 4 KiB with marker.
- `agent.tool.result` — after execution. `output` is the **whole Jie `ToolResult = { content, details?, terminate? }`** object (the value the tool's `execute` returned), JSON-serialized — not just `content`. This way observers get both the LLM-visible text and the structured `details`. Fields whose value is `undefined` are dropped by `JSON.stringify`. On a thrown `execute`, `output` is `null` and `error` carries the message. Truncated at 4 KiB (see "Truncation" below).

`tool_call_id` is the string id pi-agent provides in its `beforeToolCall` / `afterToolCall` hooks. The body passes it through to the bus as-is. The value is opaque to Jie and to consumers — it is used by observers (TUI, -p mode) to correlate a `agent.tool.call` event with the matching `agent.tool.result` event. Jie does not synthesize, renumber, or otherwise transform it.

## Agent Idle

When an agent transitions from `busy` to `idle` (work unit complete, terminal event published, or error recovery complete), it publishes `agent.idle`. This is the signal for observers (TUI, `-p` mode) that the agent is ready for new work. Replaces the heartbeat-based discovery model.

**`agent.idle` is published at startup AND on every `agent_end`.** The body publishes one `agent.idle` at the end of `body.start()` — after the body's subscriptions are registered and before it begins processing the message queue. This gives observers (TUI, `-p` mode) an explicit "agent exists, currently idle" signal at boot, so the agents-panel can populate before any prompt is sent. Subsequent publishes fire on every `agent_end` regardless of `stopReason` — whether the LLM finished naturally (`"stop"`, `"length"`) or exited from an error (`"error"`, `"aborted"`), the agent returns to idle. Observers can rely on `agent.idle` as a definitive "this agent is no longer processing" signal — they do not need to inspect `stopReason` separately to know the agent is ready for new work.

## Inter-Agent Messaging

The `notify` tool (see `06-agent-model.md`) is the sole inter-agent communication channel. It publishes `{ topic, prompt, source }` on the bus to `{topic}`. Every agent auto-subscribes to its own `{agent_key}`, enabling direct addressing. Domain topic subscriptions are declared in the agent's `.md` frontmatter `subscribe:` field.

Self-receipt filtering is done in `AgentBody`'s subscription callback — if the event's `source` matches the agent's own `agent_key`, the callback skips processing. This keeps the `EventBus` transport-agnostic; a future `NatsEventBus` would not need agent-identity awareness.

The `notify` tool is a regular tool — it does not control the LLM loop. The LLM decides when the turn is complete via `stopReason`.

## In-Process Implementation

The default `InProcessEventBus` is a `Map<string, Set<Callback>>`. No serialization, no network. Callbacks are invoked synchronously in subscription order. Unsubscribe removes the callback from the set. `subscriberCount(subject)` returns `callbacksForSubject.size`.

A future `NatsEventBus` implements the same interface over NATS core pub/sub with JSON serialization. No JetStream in v1. Agent restart and replay are Day 2 concerns.
