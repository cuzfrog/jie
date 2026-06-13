# Memory

## Purpose

The Memory subsystem provides durable persistence for an agent's conversation history. It is a write-through adapter: every message produced by the pi-agent loop is persisted to SQLite immediately. On restart, the full history is restored and loaded back into the agent.

`AgentMessage` types used throughout this chapter are defined in `pi-agent-api-reference.md`.

Memory operations are internal to the agent — they are **not** published on the event bus.

Context windowing, compaction triggering, and token estimation are owned by `@earendil-works/pi-agent-core` via its `transformContext` and `CompactionSettings`. jie's `MemoryManager` is responsible for storage only.

## MemoryManager

```typescript
interface MemoryManager {
  // Write-through a finalized message to durable storage.
  persist(message: AgentMessage, agent_key: string, session_id: string, team_id: string): void;

  // Called after pi-agent's compaction completes. Marks the compacted raw messages
  // as replaced and persists the CompactionSummaryMessage as a new row.
  compact(compactedSeqRange: [number, number], summary: AgentMessage, agent_key: string, session_id: string, team_id: string): void;

  // Restore non-compacted history from durable storage for a given (team_id, agent_key, session_id).
  // Returns the complete AgentMessage[] suitable for loading into agent.state.messages.
  // Returns an empty array if no prior history exists.
  restore(agent_key: string, session_id: string, team_id: string): Promise<AgentMessage[]>;
}
```

`MemoryManager` is initialized by `AgentBody` at startup. It does not hold an in-memory copy of the conversation — the pi-agent's `state.messages` is the sole in-memory source of truth.

### Persist

Called on every `message_end` event emitted by the pi-agent. The message is serialized and written to the `memory_turns` table immediately — no buffering, no periodic flush. Messages are partitioned by `session_id` so that a new process run starts with a fresh conversation context.

### Compact

`compact()` is called from inside the body's `transformContext` wrapper (see "Integration with pi-agent" below), not from any pi-agent event. The wrapper diffs the inner `transformContext`'s input and output arrays; for each `CompactionSummaryMessage` that appears in the output but not the input, the wrapper calls `memory.compact(range, summary, agent_key, session_id, team_id)`.

`compact()` writes the summary and updates the raw range's `compacted=1` flag, all inside a single `storage.transaction()`:

1. `INSERT INTO memory_turns` with `role='compactionSummary'` and the summary's serialized content.
2. `UPDATE memory_turns SET compacted=1 WHERE team_id = ? AND agent_key = ? AND session_id = ? AND seq BETWEEN range[0] AND range[1]`.

Atomicity: a process crash mid-`compact()` rolls back the transaction; on the next turn, the wrapper detects the summary again (it's still in the array) and re-runs `compact()`. Idempotent.

**The compactionSummary writer model.** `persist()` never writes a `compactionSummary` row — that role's row is owned exclusively by `compact()`. The body's `message_end` listener calls `persist()` unconditionally (no role check); the summary does not enter that path because pi-agent does not emit `message_end` for `CompactionSummaryMessage` injected by `transformContext` (the summary only appears in the array, not as a generated-message lifecycle event). As a defensive layer, `memory_turns` writes use `INSERT OR REPLACE` so a redundant write from any future behavior change is harmless.

### Restore

On agent start, the body determines its `session_id`:

- The body constructor accepts an optional `session_id` parameter. When provided, the body uses it. This is the override path used by `--resume`/`--continue` CLI flags (load a `session_id` from a previous process run) and by the team's swap flow on the `JieHandle` (continue the previously-active team's `session_id` for matching `(team_id, agent_key)` pairs). On team swap, the handle's in-memory map `Map<(team_id, agent_key), session_id>` is consulted first; if there's a recorded `session_id` for that pair, it's passed to the new body.
- When no `session_id` is provided, the body mints a new one (ULID, 26 chars, monotonic per `monorepo-structure.md` runtime deps — `ulid@2.3.0`; shorter than UUID v4 and human-scannable in logs and DB rows).

The body then calls `memory.restore(agent_key, session_id, team_id)`. This queries `memory_turns` for all rows matching `(team_id, agent_key, session_id)` where `compacted = false`, ordered by `seq`:

- Fresh `session_id` (newly minted, no prior rows) → empty array; the body begins with a clean conversation.
- Existing `session_id` (passed in or reused across body restarts) → prior history; the body resumes where it left off. **`seq` is per-agent**: each agent has its own `seq` counter within the session, so the leader's seq 1 and the worker's seq 1 are independent rows. The body's local counter reads `MAX(seq) WHERE (team_id, agent_key, session_id) = (current)` and increments.

The `JieHandle`'s `Map<(team_id, agent_key), session_id>` is in-memory only; it is lost on process exit. A fresh process run starts with an empty map. Each new `(team_id, agent_key)` pair seen by the handle mints a fresh `session_id` and records the mapping; subsequent body restarts for the same pair (e.g., on team swap) reuse the recorded `session_id`. Switching to a different team yields fresh session_ids for the new team's agent_keys — memory is per-agent-per-team.

Compacted raw messages are preserved in storage (for full-replay audit) but are not returned by `restore` — the `CompactionSummaryMessage` replaces them in the restored history.

## Persistence

```typescript
interface TurnRecord {
  team_id:    string;        // namespace; team whose bodies wrote this row
  session_id: string;        // per-process-run identifier; shared across agents in the same process
  agent_key:  string;        // persistent instance identity: {role}-{N}; each agent has its own memory stream
  seq:        number;        // monotonically increasing within (team_id, agent_key, session_id)
  role:       string;        // 'user' | 'assistant' | 'toolResult' | 'compactionSummary'
  content:    string;        // JSON-serialized AgentMessage
  compacted:  boolean;       // true if this row was compacted and replaced by a summary
  created_at: string;        // ISO 8601
}
```

**Serialization.** `persist()` receives an `AgentMessage` from pi-agent. The mapping to `TurnRecord` is:

| `TurnRecord` field | Source |
|---|---|
| `role` | `AgentMessage.role` (e.g. `"user"`, `"assistant"`, `"toolResult"`, `"compactionSummary"`) |
| `content` | `JSON.stringify(AgentMessage)` — the full message serialized as JSON |

Storing the full JSON-serialized message preserves all fields for `restore()`, which loads messages back into `agent.state.messages` where pi-agent expects the typed `AgentMessage` shape. The `role` column is denormalized for query convenience (e.g. listing all assistant messages in a session).

Messages are stored in the same SQLite database as the artifact store, in a separate `memory_turns` table (not in the artifact store's content-addressed work-product tables). The table is keyed by `(team_id, agent_key, session_id, seq)` — see [`04-storage.md`](04-storage.md) for the schema. Both the `MemoryManager` and the `ArtifactStore` share one `Storage` instance (and therefore one SQLite file) opened by `startJie`; the two concerns remain semantically distinct — `memory_turns` is conversation history, the artifact tables are business work products (see [`04-storage.md`](04-storage.md) and [`05-artifact-store.md`](05-artifact-store.md)).

v1 keeps all rows indefinitely (same retention policy as the storage layer — see [`04-storage.md`](04-storage.md) "Retention"). GC and pruning are deferred to **backlog item #7** (Storage Maintenance chapter).

**Team scoping.** `team_id` is the namespace for `memory_turns`. Two teams that both contain a role named `general` (and thus both have `agent_key = general-1`) live in disjoint row sets because their `team_id` differs. Users can name roles freely across teams — including reusing names — without collision. The `JieHandle`'s in-memory map keys on `(team_id, agent_key)` for the same reason. Per-team `--continue` lookups filter on `team_id`; the `idx_memory_turns_team_session_created` index on `(team_id, session_id, created_at)` makes those lookups efficient.

## Leader Agent Working Memory

The leader agent (as designated by the team blueprint) may maintain in-memory state beyond conversation history:

- **Prompt queue**: FIFO queue of user prompts received while a work unit is in flight. On completion of the current work unit, the leader dequeues the next prompt. This queue is lost on restart; in v1, queued prompts are not persisted.
- **In-flight awareness**: the leader tracks whether any work unit is currently in flight using status reads plus its own working memory. On reload, the leader reads the artifact store to discover any work unit that was in a non-terminal status at the time of crash and resumes monitoring it.

**No platform-reserved key for in-flight tracking.** The platform does not reserve an artifact key (e.g., `__in_flight__`) for in-flight awareness — this is the team's concern. The platform's role is to make the artifact store available; the team defines the key scheme. This is consistent with ADR 7 (which removed `work_id` from `ExecutionContext`): the platform is generic; the team owns its own identifier scheme.

## Integration with pi-agent

`MemoryManager` integrates via pi-agent's event subscription and the body's `transformContext` wrapper:

- **Subscription**: The body calls `agent.subscribe(listener)`. On `message_end`, it calls `memory.persist(message, agent_key, session_id, team_id)` unconditionally — no role check, no special case for summaries.
- **`transformContext` wrapper**: The body passes a wrapped `transformContext` to pi-agent via `AgentOptions`. The wrapper calls the inner `transformContext` (pi-agent's default, or the Day 2+ compaction implementation), diffs the input and output arrays, and for each `CompactionSummaryMessage` that appears in the output but not the input, computes the seq range and calls `memory.compact(range, summary, agent_key, session_id, team_id)`. The wrapper returns the new array unchanged. **The wrapper is invariant across days**: in v1 the inner is the identity function (no compaction → wrapper is a no-op); in Day 2+ the inner is the actual compaction logic → wrapper persists the produced summaries. Compaction is trigger-agnostic — whether the trigger is the user's `/compact` slash command, pi-agent's auto-threshold, or a Day 2+ team hook, all paths funnel through `transformContext` and the wrapper persists.
- **`agent_end` listener**: publishes `agent.idle` only. Does not detect compaction (the `transformContext` wrapper owns that).
- **Restore**: On agent start, the body mints a new `session_id` by default, or uses a passed-in `session_id` (from `--resume`/`--continue` CLI flags or from the `JieHandle`'s `Map<(team_id, agent_key), session_id>` on team swap). The body calls `memory.restore(agent_key, session_id, team_id)`, pushes the returned `AgentMessage[]` into `agent.state.messages`, then calls `agent.continue()`.
- **Tool hooks**: `beforeToolCall` and `afterToolCall` are wired at Agent construction but not used for memory — only for Jie's EventBus telemetry (`agent.tool.call` / `agent.tool.result`). See `06-agent-model.md` pi-agent Integration Contract.

pi-agent's `CompactionSettings` are configured at agent construction with `enabled: false` for v1 (compaction deferred). When enabled, pi-agent's `transformContext` triggers summarization; the resulting `CompactionSummaryMessage` is detected by the body's `transformContext` wrapper, which calls `MemoryManager.compact()` to record the compaction in storage.
