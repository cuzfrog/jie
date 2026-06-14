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

A single `jie` process can host multiple teams' bodies. Team-specific channels are scoped by `team_id`; platform events are un-scoped and carry `team_id` in the envelope (see `AgentEvent` below).

**Team-scoped subjects (prefixed with `{team_id}.`):**

| Subject | Purpose | Subscribers / publishers |
|---|---|---|
| `{team_id}.leader.prompt` | Leader prompt ingress from TUI or `-p` mode | Leader auto-subscribes; TUI publishes (scoped to the active team). |
| `{team_id}.{agent_key}` | Direct-addressing channel; the agent with this key auto-subscribes | Every agent auto-subscribes; `notify` publishes. |
| `{team_id}.{domain_topic}` | Team-defined domain events (e.g. `task.recorded`, `work.researched`) | Agents subscribe via `subscribe:` in `.md`; `notify` publishes. |
| `{team_id}.team.loaded` | One-shot per team load; payload `{ team_id, agents: { role, agent_key }[] }` — the team's roster. The TUI's agents-panel-at-boot anchor (per ADR 22). | `JieHandle` publishes in `startJie` and `loadTeam`. Not republished on team swap-back. |

**Platform subjects (un-scoped, `team_id` in the envelope):**

| Subject | Purpose |
|---|---|
| `agent.stream.chunk` | Batched LLM output (all agents across all loaded teams) |
| `agent.stream.end` | LLM response complete |
| `agent.tool.call` | Tool invocation about to execute |
| `agent.tool.result` | Tool execution completed |
| `agent.queue.update` | Agent's in-memory prompt queue changed (enqueue or dequeue) |
| `agent.turn.start` | Agent began a turn (pi-agent `turn_start` bridged to bus; consumed by the CLI's `-p` idle gate and the TUI's busy/idle derivation) |
| `agent.idle` | Agent entered idle state |

The team-blueprint author writes **unscoped** names in `.md` (`leader.prompt`, `leader-1`, `task.recorded`) and in `notify` calls. The platform prefixes `{team_id}.` at body construction (for subscriptions) and at publish time (for `notify`). The agent's view is un-scoped; the bus's view is team-scoped. See ADR 19.

- `agent_key` — persistent agent identity: `{role}-{N}` (e.g. `leader-1`, `researcher-1`). Every agent auto-subscribes to `{team_id}.{agent_key}` at startup. Used for direct inter-agent addressing via `notify`.
- `domain_topic` — dotted string defined by the team blueprint (e.g. `task.recorded`, `work.researched`, `task.completed`). Agents subscribe via `subscribe:` in their `.md` frontmatter; the platform prefixes `{team_id}.` at body construction.
- The leader additionally auto-subscribes to `{team_id}.leader.prompt` for user input ingress.

The TUI subscribes to the un-scoped platform subjects globally and filters by the active team's `team_id` (from the envelope). Multiple teams' platform events flow on the same subjects; the envelope disambiguates.

No `session_id` in subjects — one process run is one session. `session_id` is internal to AgentBody and the Memory subsystem (see `08-memory.md`) where it partitions durable conversation history per process run. It is not published on the event bus.

## Event Envelope

```typescript
interface AgentEvent<T extends string = string> {
  version:     1;           // envelope format version
  team_id:     string;      // team's identity (matches the team's directory name)
  event_type:  T;           // un-scoped logical name (e.g. 'leader.prompt', 'agent.stream.chunk')
  agent_role:  string;      // team-defined role identifier
  agent_key:   string;      // persistent slot identity: {role}-{N}
  timestamp:   string;      // ISO 8601
  payload:     Record<string, unknown>;
}
```

`payload` is a discriminated union keyed on `event_type`. The platform defines infrastructure event payloads; the team blueprint defines domain event payloads.

**Wire format — the bus payload IS the envelope.** Every publisher on the bus (body, TUI, CLI) constructs and publishes a full `AgentEvent` envelope. The bus's `publish(subject, payload)` second argument is the envelope; the bus's `subscribe` callback receives `(subject, envelope)`. There is no shorthand or partial-publish path. When a body publishes via `notify`, the body fills every envelope field (`event_type` from the LLM's topic, `payload: { prompt, source }` per `PlatformEventPayload`, `team_id` from the body's team, `agent_role` and `agent_key` from the body, `version: 1`, `timestamp` ISO 8601). When the TUI or CLI publishes a user prompt to `leader.prompt` (or a direct-addressed user prompt to a specific agent's `{agent_key}`), it fills every envelope field — the convention is that the TUI/CLI fills `agent_role` and `agent_key` with the **target agent's** role and `agent_key` (the leader for `leader.prompt`; the targeted agent for direct addressing) so the envelope matches what the target would have published. The full per-publisher wire-format contract is in `02-protocol-stack.md` "Prompt Ingress" and `06-agent-model.md` `notify` step 2.

**Reading the envelope at a subscriber.** A subscriber reads `envelope.payload` (the inner data) for the event-type-specific fields (e.g., `envelope.payload.prompt` for `leader.prompt`, `envelope.payload.source` for self-receipt filtering on `notify`-sourced events). `envelope.team_id` is the authoritative team identity (the subject's `{team_id}.` prefix is the bus-level scoping, but the envelope is the source of truth for filtering). The body's subscription callback for `notify`-sourced events reads `envelope.payload.source` and compares it to the body's own `agent_key` for self-receipt filtering (per `06-agent-model.md` "Built-in Tool: `notify`" step 3).

### Platform Event Payloads

```typescript
type PlatformEventPayload<T extends PlatformEventType> =
  T extends 'leader.prompt'        ? { prompt: string } :
  T extends 'user.prompt'          ? { prompt: string } :
  T extends 'agent.stream.chunk'   ? { stream_id: number; seq: number; block_type: "text" | "thinking"; text: string } :
  T extends 'agent.stream.end'     ? { stream_id: number; total_chunks: number } :
  T extends 'agent.tool.call'      ? { tool_call_id: string; name: string; input: string; input_truncated: boolean } :
  T extends 'agent.tool.result'    ? { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null } :
  T extends 'agent.queue.update'   ? { prompts: string[] } :
  T extends 'agent.turn.start'     ? { } :
  T extends 'agent.idle'           ? { } :
  // Topic-published events (notify's `event_type` from the LLM, team-defined
  // domain events): the platform does not validate the payload shape. Bodies
  // publish `{ prompt, source }` (per the `notify` tool's contract); observers
  // read the inner fields defensively. The catch-all is the type-level
  // approximation; the actual domain payload is opaque to the platform.
  T extends string                 ? { prompt: string; source: string } :
  never;
```

**Type-narrowing boundary.** `user.prompt` (TUI direct-addressed user prompt) has payload `{ prompt: string }` — no `source` field, because the TUI is not an agent. The body formats the synthetic `user` message by the actual presence of `payload.source` (per `06-agent-model.md` "Prompt Ingress & Queuing"), so the type's catch-all is not consulted at runtime for `user.prompt`. The platform's own event payloads are precisely typed. Domain event types (`notify`'s `event_type` from the LLM) fall through to the `{ prompt, source }` shape — the actual domain payload is opaque to the platform; the receiving agent's LLM parses it from the synthetic `user` message. The platform's only validation is the envelope (version, agent_role, agent_key, timestamp) and the platform's own event payloads.

```typescript
type PlatformEventType =
  | 'leader.prompt'
  | 'user.prompt'
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

LLM output originates from pi-agent's `message_update` events (per-token deltas). The body buffers and publishes `agent.stream.chunk` on the EventBus:

- **Buffering**: accumulated per `block_type` (`"text"` for `text_delta`, `"thinking"` for `thinking_delta`; tool_call deltas are not streamed). Flush at 64 chars, 200 ms, or `block_type` change (transitions flush the prior buffer first so each chunk carries one type).
- **Publish**: `agent.stream.chunk` — `{ stream_id: number; seq: number; block_type: "text" | "thinking"; text: string }`. `stream_id` is a per-LLM-invocation counter; `seq` is the chunk ordinal within that stream.
- **Completion**: on `message_end` (assistant response finalized), flush the remaining buffer and publish `agent.stream.end` with `{ stream_id, total_chunks }`.

Tunables (`stream_chunk_size`, `stream_flush_ms`) are in `10-configuration.md` "Streaming Tunables". The 5-step body implementation (buffer allocation, flush timer, block-type transitions) is in `06-agent-model.md` "Streaming Pipeline". The TUI and `-p` mode consume these events.

## Event-Order Contract

Two pieces, both load-bearing for observer-side state machines (the CLI's `-p` idle gate, the TUI's busy/idle derivation, any future observer that wants to know "is the work done?").

### Body-side alternation

For each body, the platform events `agent.turn.start` and `agent.idle` follow a **strict alternation**:

- A body that has not yet started any turn has published no events; observers treat it as **idle by default** (no event required).
- On every pi-agent `turn_start`, the body publishes exactly one `agent.turn.start`.
- On every pi-agent `agent_end`, the body publishes exactly one `agent.idle`.
- For the same turn, `agent.turn.start` is always published before the corresponding `agent.idle`. The body never publishes `agent.idle` without a preceding `agent.turn.start` for the same turn.
- Across turns: `turn_start` → `idle` → `turn_start` → `idle` → ...

The body emits these events on the un-scoped platform subjects (`agent.turn.start`, `agent.idle`); the bus delivers them in publish order; observers (CLI, TUI) update per-body state machines. The body is the sole producer of the alternation; the bus does not synthesize, reorder, or drop events.

### Bus-side in-order delivery

- **v1 (`InProcessEventBus`):** Events are dispatched to subscribers synchronously in publish order. Per-body event order is preserved end-to-end. This is the v1 guarantee that makes the body-side alternation observable as written.
- **Day-2 NATS:** NATS preserves order per subject but not across subjects. `agent.turn.start` and `agent.idle` are different subjects, so a subscriber could observe `agent.idle` for body A before `agent.turn.start` for body A if NATS reorders across subjects. The Day-2 fix is a **per-body monotonic `seq`** stamped on every event the body publishes; observers discard updates whose `seq` ≤ last-seen for that body, collapsing cross-subject reorder into a no-op. This is a Day-2 concern; see `backlog.md`.

### Why this contract matters

The CLI's `-p` idle gate (`ui/cli.md` `jie -p` step 7) is a local state machine initialized with all bodies in the "idle" state. The gate opens when "all bodies' last observed event is `idle`". Without the body-side alternation, a body could transition from "no event seen" directly to "`idle`" — the gate would open without the body ever having been observed as "busy". The alternation makes this impossible: every `idle` is preceded by a `turn_start` for the same turn, so the body moves through `busy` first. The bus-side in-order delivery makes the per-body state machine deterministic.

The TUI's "agent is busy / idle" derivation in `11-monitoring.md` is also a consumer of this contract. Any future observer (Day-2+ tooling, a `-p` mode that loads multiple teams, etc.) follows the same pattern: subscribe to `agent.turn.start` and `agent.idle`, maintain a per-body state, and treat the absence of events as idle-by-default.

---

## Tool Telemetry

Every tool call emits two events:

- `agent.tool.call` — before execution. `input` is JSON-serialized; truncated at 4 KiB with marker.
- `agent.tool.result` — after execution. `output` is the **whole Jie `ToolResult = { content, details?, terminate? }`** object (the value the tool's `execute` returned), JSON-serialized — not just `content`. This way observers get both the LLM-visible text and the structured `details`. Fields whose value is `undefined` are dropped by `JSON.stringify`. On a thrown `execute`, `output` is `null` and `error` carries the message. Truncated at 4 KiB (see "Truncation" below).

`tool_call_id` is the string id pi-agent provides in its `beforeToolCall` / `afterToolCall` hooks. The body passes it through to the bus as-is. The value is opaque to Jie and to consumers — it is used by observers (TUI, -p mode) to correlate a `agent.tool.call` event with the matching `agent.tool.result` event. Jie does not synthesize, renumber, or otherwise transform it.

## Agent Idle

When an agent transitions from `busy` to `idle` (work unit complete, terminal event published, or error recovery complete), it publishes `agent.idle`. This is the signal for observers (TUI, `-p` mode) that the agent is ready for new work. Replaces the heartbeat-based discovery model.

**`agent.idle` is published on every `agent_end` only.** A body that has not yet processed any turn has published no events; observers treat it as **idle by default** (no event required). The "this agent exists" signal at boot is the separate `{team_id}.team.loaded` event (see Subject Schema), published by the `JieHandle` once per team load, not by the body. The new design separates "this team is loaded" (a one-shot team-routing announcement) from "this body transitioned busy→idle" (a per-body state-transition event).

`agent.idle` fires on every `agent_end` regardless of `stopReason` — whether the LLM finished naturally (`"stop"`, `"length"`) or exited from an error (`"error"`, `"aborted"`), the agent returns to idle. Observers can rely on `agent.idle` as a definitive "this agent is no longer processing" signal — they do not need to inspect `stopReason` separately to know the agent is ready for new work. The body never publishes `agent.idle` without a preceding `agent.turn.start` for the same turn; see "Event-Order Contract" below.

## Inter-Agent Messaging

The `notify` tool (see `06-agent-model.md`) is the sole inter-agent communication channel. The team's view: the LLM supplies `{ topic, prompt, source }` and the platform publishes to `{team_id}.{topic}`. Every agent auto-subscribes to `{team_id}.{agent_key}` (the platform prefixes at body construction), enabling direct addressing. Domain topic subscriptions are declared in the agent's `.md` frontmatter `subscribe:` field (unscoped in the author's view; the platform prefixes at body construction).

Self-receipt filtering is done in `AgentBody`'s subscription callback — if the event's `source` matches the agent's own `agent_key`, the callback skips processing. This keeps the `EventBus` transport-agnostic; a future `NatsEventBus` would not need agent-identity awareness.

The `notify` tool is a regular tool — it does not control the LLM loop. The LLM decides when the turn is complete via `stopReason`.

## In-Process Implementation

The default `InProcessEventBus` is a `Map<string, Set<Callback>>`. No serialization, no network. Callbacks are invoked synchronously in subscription order. Unsubscribe removes the callback from the set. `subscriberCount(subject)` returns `callbacksForSubject.size`.

A future `NatsEventBus` implements the same interface over NATS core pub/sub with JSON serialization. No JetStream in v1. Agent restart and replay are Day 2 concerns.

## Error Containment

A single subscriber's callback throwing must not break dispatch to other subscribers, and must not propagate back to the publisher. The bus's contract:

1. The bus wraps each callback invocation in a try/catch. If the callback throws (or returns a rejected promise from its async work — synchronous throws only in v1 since `InProcessEventBus` dispatches synchronously), the bus catches the exception.
2. The publisher's `publish()` call continues to the next subscriber in subscription order. A single misbehaving subscriber does not stop the rest of the dispatch, and does not surface the exception to the publisher's caller.
3. The caught exception is logged via `console.error` with: the subject, the error message, and the stack trace. The log line is the v1 observability surface; no new event type is published on the bus for subscriber errors in v1.
4. The bus's own `publish()` call does not throw on subscriber errors. `subscriberCount` is unaffected by errors.

This contract is transport-agnostic. A future `NatsEventBus` impl honors the same rules: per-subscriber isolation, log on error, never propagate to publisher. The in-process impl satisfies it by wrapping the callback invocation in a try/catch around each `Set<Callback>` entry's call.
