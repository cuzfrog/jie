# Event System

## Subject Schema

```
session.{session_id}.{event_type}
team.{team_id}.prompt
team.{team_id}.{agent_id}.prompt
team.{team_id}.response.{reply_id}
supervisor.{team_id}.heartbeat
agent.{team_id}.{role}.{agent_id}.heartbeat
```

- `session_id` — 16-char lowercase hex (uint64). Derived statelessly as `hash64(timestamp_ns || team_id || nonce)`. Not persisted: a collision is astronomically unlikely at this width and is treated as "should not happen". If the leader observes a JetStream rejection consistent with subject reuse, it logs and retries once with a fresh nonce; further failure → the leader publishes a rejection event. The leader mints `session_id` when it records (or rejects) a work unit.
- `event_type` — dotted name defined by the team blueprint. Agents subscribe to specific subjects (e.g. `session.*.task.recorded`); no wildcard fan-out + client-side filtering.
- `team.{team_id}.prompt` — prompt ingress subject. The leader agent subscribes to receive user prompts from the TUI or CLI.
- `team.{team_id}.{agent_id}.prompt` — per-agent prompt ingress. An agent subscribes to its own id-specific subject if it accepts direct user input.
- `team.{team_id}.response.{reply_id}` — leader response channel for the `jie prompt` request-response pattern (see `07-ui/messaging-protocol.md`).
- `supervisor.{team_id}.heartbeat` — supervisor liveness heartbeat (see `11-monitoring.md`).
- `agent.{team_id}.{role}.{agent_id}.heartbeat` — per-agent liveness and status heartbeat (see `11-monitoring.md`).

**Event types are not defined by the platform.** The team blueprint specifies what domain events exist, their payloads, and the subscription graph. The platform provides the event bus, envelope, identifier generation, streaming, and durability — the team provides the semantics.

## Identifiers

| Field | Type | Generation |
|---|---|---|
| `session_id` | 16-hex (uint64) | Stateless hash of `(timestamp_ns, team_id, nonce)`. Minted by the leader agent. |
| `event_id` | 8-hex (uint32) | Stateless hash of `(session_id, agent_id, in-memory counter, hr_time_ns)`. The counter is process-local and lost on restart; that is acceptable because events are transient. |
| `agent_id` | string, `{role}-{8-hex}`, e.g. `researcher-a1b2c3d4` | Minted fresh on every process start. 8 hex chars from a random uint32. Collision is not a practical concern within a single team (4B values per role). An agent that restarts gets a new `agent_id`. |
| `stream_id` | uint32 | Per-agent monotonic counter, in-memory. Tags one LLM invocation. Resets on agent restart. uint32 is wide enough that wraparound is not a practical concern within an agent's lifetime; consumers nevertheless demux on the composite key `(agent_id, stream_id)` because `stream_id` is not unique across agents. |
| `tool_call_id` | uint32 | Per-agent monotonic counter, in-memory, starting at 0. Assigns a unique id to each tool call within the agent's lifetime. Tags both `agent.tool.call` and its matching `agent.tool.result`. Resets on agent restart. |

No identifier is persisted in the artifact store. The artifact store keys are its own concern (see `04-artifact-store.md`).

## Event Envelope

```typescript
interface AgentEvent<T extends string = string> {
  event_id:    string;     // 8-hex
  session_id:  string;     // 16-hex
  event_type:  T;
  agent_role:  string;     // team-defined role identifier
  agent_id:    string;     // process instance id (see Identifiers table)
  timestamp:   string;     // ISO 8601
  payload:     Record<string, unknown>;
}
```

`payload` is a discriminated union keyed on `event_type`, defined by the team blueprint. The platform does not prescribe the shape of domain events. The body validates the payload against the team-provided schema for the event type.

The platform defines only infrastructure event types:

```typescript
// Platform-level event types — always available
type PlatformEventType =
  | 'agent.stream.chunk'   // Batched LLM output (see Streaming below)
  | 'agent.stream.end'     // LLM response complete
  | 'agent.tool.call'      // Tool invocation about to execute (see Tool Telemetry)
  | 'agent.tool.result';   // Tool execution completed (see Tool Telemetry)
```

Platform event payloads:

```typescript
type PlatformEventPayload<T extends PlatformEventType> =
  T extends 'agent.stream.chunk'  ? { stream_id: number; seq: number; text: string } :
  T extends 'agent.stream.end'    ? { stream_id: number; total_chunks: number } :
  T extends 'agent.tool.call'     ? { tool_call_id: number; name: string; input: string; input_truncated: boolean } :
  T extends 'agent.tool.result'   ? { tool_call_id: number; name: string; output: string; output_truncated: boolean; duration_ms: number; error: string | null } :
  never;
```

> Domain event types (e.g. `task.recorded`, `task.review_passed`) are defined by the team blueprint — see `jie-team/05-event-types.md`.

## Streaming

LLM output is **batched**, not per-token, to keep bus throughput sane.

`AgentBody` accumulates tokens from the LLM stream into a buffer and flushes an `agent.stream.chunk` event when **either** condition fires first:

- buffer reaches **64 characters**, or
- **200 ms** has elapsed since the first token in the current buffer.

Each chunk carries the agent's `stream_id` (identifies the LLM invocation) and a per-stream `seq` number (chunk ordinal). `agent.stream.end` marks completion and reports `total_chunks` for integrity checking.

Tunables (`64 chars`, `200 ms`) are configurable per team in platform config.

## Durability

| Subject pattern | JetStream | Rationale |
|---|---|---|
| `session.*.{domain_events}` | **Durable** | Required for replay and post-mortem. Domain events are team-defined; the team blueprint tags which events are durable. |
| `session.*.agent.stream.*` | **Ephemeral** | High volume; loss is acceptable. |
| `session.*.agent.tool.*` | **Ephemeral** | Diagnostic; loss is acceptable. |
| `team.*.prompt` | **Ephemeral** | Prompt ingestion is best-effort; the user can resend. |

> NATS JetStream is included in the open-source `nats-server` (Apache 2.0). No paid tier required.

## Subscriptions

Agents subscribe to **specific** subjects derived from `soul.subscriptions`. The team blueprint defines the subscription graph — which roles subscribe to which events.

No central router. No agent is aware of other agents by identity. How any observer (e.g. TUI) consumes these events is its own concern.

Tool telemetry events (`agent.tool.call`, `agent.tool.result`) are **observer-only**: no agent role subscribes to them. They exist for diagnostics, debugging, and TUI tool panels.
