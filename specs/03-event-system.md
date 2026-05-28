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

- `session_id` — 16-char lowercase hex (uint64). Derived statelessly as `hash64(timestamp_ns || team_id || nonce)`. Not persisted: a collision is astronomically unlikely at this width and is treated as "should not happen". If the DM observes a JetStream rejection consistent with subject reuse on publish of `task.recorded`, it logs and retries `notify('task.recorded', ...)` once with a fresh nonce; further failure → `notify('task.rejected', { reason: 'session_collision' })`. The DM mints `session_id` when it records (or rejects) a task.
- `event_type` — dotted name from the table below. Agents subscribe to specific subjects (e.g. `session.*.task.recorded`); no wildcard fan-out + client-side filtering.
- `team.{team_id}.prompt` — prompt ingress subject. The DM subscribes to `team.{team_id}.prompt` to receive user prompts from the TUI or CLI. Payload: `{ prompt: string }`.
- `team.{team_id}.{agent_id}.prompt` — per-agent prompt ingress. An agent subscribes to its own id-specific subject if it accepts direct user input. This subject pattern is reserved but per-agent prompt handling for non-DM roles is deferred.
- `team.{team_id}.response.{reply_id}` — DM response channel for the `jie prompt` request-response pattern (see `11-ui/messaging-protocol.md`).
- `supervisor.{team_id}.heartbeat` — supervisor liveness heartbeat (see `15-monitoring.md`).
- `agent.{team_id}.{role}.{agent_id}.heartbeat` — per-agent liveness and status heartbeat (see `15-monitoring.md`).

## Identifiers

| Field | Type | Generation |
|---|---|---|
| `session_id` | 16-hex (uint64) | Stateless hash of `(timestamp_ns, team_id, nonce)`. Minted by DM. |
| `task_id` | string, charset `[A-Za-z0-9_-]`, max 64 chars | User-supplied (e.g. `PROJ-123`, `gh-issue-42`) when available, otherwise `prompt-{hash8}` minted by DM. Embedded in the task artifact. **Not** in the subject — kept in the envelope only. **Normalization**: the DM trims leading/trailing whitespace from user input, then validates the charset and length; any violation causes `task.rejected`. Case is preserved — `PROJ-123` and `proj-123` are distinct. DM-minted ids (`prompt-{hash8}`, `unparseable-{hash8}`) are already canonical. |
| `event_id` | 8-hex (uint32) | Stateless hash of `(session_id, agent_id, in-memory counter, hr_time_ns)`. The counter is process-local and lost on restart; that is acceptable because events are transient. |
| `agent_id` | string, `{role}-{8-hex}`, e.g. `researcher-a1b2c3d4` | Minted fresh on every process start. 8 hex chars from a random uint32. Collision is not a practical concern within a single team (4B values per role). An agent that restarts gets a new `agent_id`. |
| `stream_id` | uint32 | Per-agent monotonic counter, in-memory. Tags one LLM invocation. Resets on agent restart. uint32 is wide enough that wraparound is not a practical concern within an agent's lifetime; consumers nevertheless demux on the composite key `(agent_id, stream_id)` because `stream_id` is not unique across agents. |
| `tool_call_id` | uint32 | Per-agent monotonic counter, in-memory, starting at 0. Assigns a unique id to each tool call within the agent's lifetime. Tags both `agent.tool.call` and its matching `agent.tool.result`. Resets on agent restart. |

No identifier is persisted in the artifact store. The artifact store keys are `ArtifactId` (its own concern, see `04-artifact-store.md`).

## Event Envelope

```typescript
interface AgentEvent<T extends EventType = EventType> {
  event_id:    string;     // 8-hex
  session_id:  string;     // 16-hex
  task_id:     string;     // user/DM-supplied
  iteration:   number;     // current iteration of the task; starts at 1
  event_type:  T;
  agent_role:  AgentRole;  // 'dm' | 'architect' | 'researcher' | 'planner' | 'implementer' | 'reviewer'
  agent_id:    string;     // process instance id, e.g. 'researcher-a1b2c3d4' (see Identifiers table)
  timestamp:   string;     // ISO 8601
  payload:     EventPayload<T>;
}
```

`payload` is a **discriminated union** keyed on `event_type`:

```typescript
type EventPayload<T extends EventType> =
  T extends 'task.recorded'       ? { task_artifact_id: ArtifactId } :
  T extends 'task.rejected'       ? { reason: string } :
  T extends 'task.researched'     ? { research_artifact_id: ArtifactId } :
  T extends 'task.designed'       ? { descriptor_paths: string[] } :     // workspace-root-relative paths
  T extends 'task.planned'        ? { plan_artifact_id: ArtifactId } :
  T extends 'task.implemented'    ? { result_artifact_ids: ArtifactId[] } :
  T extends 'task.review_passed'  ? { review_artifact_id: ArtifactId } :
  T extends 'task.review_failed'  ? { review_artifact_id: ArtifactId } :
  T extends 'task.done'           ? { review_artifact_id: ArtifactId } :
  T extends 'task.failed'         ? { error: string; phase: AgentRole } :
  T extends 'agent.stream.chunk'  ? { stream_id: number; seq: number; text: string } :
  T extends 'agent.stream.end'    ? { stream_id: number; total_chunks: number } :
  T extends 'agent.tool.call'     ? { tool_call_id: number; name: string; input: string; input_truncated: boolean } :
  T extends 'agent.tool.result'   ? { tool_call_id: number; name: string; output: string; output_truncated: boolean; duration_ms: number; error: string | null } :
  never;
```

`ArtifactId` is `string` (ULID; see `04-artifact-store.md`).

## Event Types

```typescript
type EventType =
  | 'task.recorded'        // DM wrote task artifact; session begins
  | 'task.rejected'        // DM declined to start a session (pre-record failure)
  | 'task.researched'      // Researcher completed
  | 'task.designed'        // Architect updated module descriptor
  | 'task.planned'         // Planner completed (iteration N)
  | 'task.implemented'     // Implementer completed (iteration N)
  | 'task.review_passed'   // Reviewer accepted; iteration ends successfully
  | 'task.review_failed'   // Reviewer rejected; planner picks up for next iteration
  | 'task.done'            // DM finalized a review_passed task (external ticket updated, etc.); terminal
  | 'task.failed'          // Any non-DM role signals unrecoverable failure (terminal)
  | 'agent.stream.chunk'   // Batched LLM output (see Streaming below)
  | 'agent.stream.end'     // LLM response complete
  | 'agent.tool.call'     // Tool invocation about to execute (see Tool Telemetry)
  | 'agent.tool.result';   // Tool execution completed (see Tool Telemetry)
```

> Internal agent state transitions (e.g. context compaction) are **not** published on the event bus. They belong to the Memory subsystem (see `12-memory.md`).

## Streaming

LLM output is **batched**, not per-token, to keep bus throughput sane.

`AgentBody` accumulates tokens from the LLM stream into a buffer and flushes an `agent.stream.chunk` event when **either** condition fires first:

- buffer reaches **64 characters**, or
- **200 ms** has elapsed since the first token in the current buffer.

Each chunk carries the agent's `stream_id` (identifies the LLM invocation) and a per-stream `seq` number (chunk ordinal). `agent.stream.end` marks completion and reports `total_chunks` for integrity checking.

Tunables (`64 chars`, `200 ms`) are configurable per team in `core` config.

## Durability

| Subject pattern | JetStream | Rationale |
|---|---|---|
| `session.*.task.*` | **Durable** | Required for replay and post-mortem. |
| `session.*.agent.stream.*` | **Ephemeral** | High volume; loss is acceptable. |
| `session.*.agent.tool.*` | **Ephemeral** | Diagnostic; loss is acceptable. |
| `team.*.prompt` | **Ephemeral** | Prompt ingestion is best-effort; the user can resend. |

> NATS JetStream is included in the open-source `nats-server` (Apache 2.0). No paid tier required.

## Subscriptions

Agents subscribe to **specific** subjects derived from `soul.subscriptions`. Example:

```
researcher soul:  session.*.task.recorded
architect soul:   session.*.task.researched
planner soul:     session.*.task.designed, session.*.task.review_failed
implementer soul: session.*.task.planned
reviewer soul:    session.*.task.implemented
dm soul:          team.{team_id}.prompt, session.*.task.review_passed, session.*.task.failed
```

No central router. No agent is aware of other agents by identity. How any observer (e.g. TUI) consumes these events is its own concern.

Tool telemetry events (`agent.tool.call`, `agent.tool.result`) are **observer-only**: no agent role subscribes to them. They exist for diagnostics, debugging, and TUI tool panels.
