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
  persist(message: AgentMessage, agent_key: string, session_id: string): void;

  // Called after pi-agent's compaction completes. Marks the compacted raw messages
  // as replaced and persists the CompactionSummaryMessage as a new row.
  compact(compactedSeqRange: [number, number], summary: AgentMessage, agent_key: string, session_id: string): void;

  // Restore non-compacted history from durable storage for a given (agent_key, session_id).
  // Returns the complete AgentMessage[] suitable for loading into agent.state.messages.
  // Returns an empty array if no prior history exists.
  restore(agent_key: string, session_id: string): Promise<AgentMessage[]>;
}
```

`MemoryManager` is initialized by `AgentBody` at startup. It does not hold an in-memory copy of the conversation — the pi-agent's `state.messages` is the sole in-memory source of truth.

### Persist

Called on every `message_end` event emitted by the pi-agent. The message is serialized and written to the `memory_turns` table immediately — no buffering, no periodic flush. Messages are partitioned by `session_id` so that a new process run starts with a fresh conversation context.

### Compact

pi-agent's `transformContext` handles compaction: it selects raw messages to compact, generates a summary via a separate LLM call, and injects a `CompactionSummaryMessage` into the message array. When compaction completes, the agent body calls `memory.compact()` to sync storage:

1. The summary message is persisted as a new row (like any other message).
2. The raw messages in the compacted range are marked `compacted = true`.

### Restore

On agent start, the body determines its `session_id`:

- The body constructor accepts an optional `session_id` parameter. When provided, the body uses it. This is the override path used by `--resume`/`--continue` CLI flags (load a `session_id` from a previous process run) and by the TUI's team swap (continue the previously-active team's `session_id` for matching `agent_key`s). On team swap, the supervisor's in-memory map `Map<agent_key, session_id>` is consulted first; if the `agent_key` has a stored `session_id`, it is passed to the new body.
- When no `session_id` is provided, the body mints a new one (UUID generated at body construction).

The body then calls `memory.restore(agent_key, session_id)`. This queries `memory_turns` for all rows matching `(agent_key, session_id)` where `compacted = false`, ordered by `seq`:

- Fresh `session_id` (newly minted, no prior rows) → empty array; the body begins with a clean conversation.
- Existing `session_id` (passed in or reused across body restarts) → prior history; the body resumes where it left off. `seq` continues from `max(existing seqs) + 1` so message ordering is contiguous across body restarts.

The supervisor's `Map<agent_key, session_id>` is in-memory only; it is lost on process exit. A fresh process run starts with an empty map. Each new `agent_key` seen by the supervisor mints a fresh `session_id` and records the mapping; subsequent body restarts for the same `agent_key` (e.g., on team swap) reuse the recorded `session_id`.

Compacted raw messages are preserved in storage (for full-replay audit) but are not returned by `restore` — the `CompactionSummaryMessage` replaces them in the restored history.

## Persistence

```typescript
interface TurnRecord {
  session_id: string;
  agent_key:  string;
  seq:        number;        // monotonically increasing within the session
  role:       string;        // 'user' | 'assistant' | 'toolResult' | 'compactionSummary'
  content:    string;        // JSON-serialized AgentMessage
  compacted:  boolean;       // true if this row was compacted and replaced by a summary
  created_at: string;        // ISO 8601
}
```

**Serialization.** `persist()` receives an `AgentMessage` from pi-agent. The mapping to `TurnRecord` is:

| `TurnRecord` field | Source |
|---|---|
| `role` | `AgentMessage.role` (e.g. `"user"`, `"assistant"`, `"toolResult"`, `"compactionSummary"`, `"bashExecution"`, `"custom"`) |
| `content` | `JSON.stringify(AgentMessage)` — the full message serialized as JSON |

Storing the full JSON-serialized message preserves all fields for `restore()`, which loads messages back into `agent.state.messages` where pi-agent expects the typed `AgentMessage` shape. The `role` column is denormalized for query convenience (e.g. listing all assistant messages in a session).

Messages are stored in the same SQLite database as the artifact store, in a separate `memory_turns` table (not in the artifact store's content-addressed work-product tables). The table is keyed by `(agent_key, session_id, seq)`. Sharing the database file avoids a second storage surface; the two concerns remain semantically distinct — `memory_turns` is conversation history, the artifact tables are business work products (see `04-artifact-store.md`).

v1 keeps all rows indefinitely (same retention policy as the artifact store — see `04-artifact-store.md`). GC and pruning are deferred to **backlog item #7** (Storage Maintenance chapter).

**Cross-team agent_key collisions.** `memory_turns` is keyed by `(agent_key, session_id, seq)` and is not namespaced by team. If two teams contain roles with the same name (and thus the same `agent_key`, e.g. both have a `general-1`), their conversation histories share rows in `memory_turns`. v1 does not namespace by team — users avoid collisions by naming roles uniquely across teams (a project-local team override can shadow a global one). The platform surfaces a startup WARN if a freshly-loaded team would create `agent_key` rows that already exist for the current `session_id`, indicating a probable collision.

## Leader Agent Working Memory

The leader agent (as designated by the team blueprint) may maintain in-memory state beyond conversation history:

- **Prompt queue**: FIFO queue of user prompts received while a work unit is in flight. On completion of the current work unit, the leader dequeues the next prompt. This queue is lost on restart; in v1, queued prompts are not persisted.
- **In-flight awareness**: the leader tracks whether any work unit is currently in flight using status reads plus its own working memory. On reload, the leader reads the artifact store to discover any work unit that was in a non-terminal status at the time of crash and resumes monitoring it.

**No platform-reserved key for in-flight tracking.** The platform does not reserve an artifact key (e.g., `__in_flight__`) for in-flight awareness — this is the team's concern. The platform's role is to make the artifact store available; the team defines the key scheme. This is consistent with ADR 7 (which removed `work_id` from `ExecutionContext`): the platform is generic; the team owns its own identifier scheme.

## Integration with pi-agent

`MemoryManager` integrates via pi-agent's event subscription and hooks:

- **Subscription**: The body calls `agent.subscribe(listener)`. On `message_end`, it calls `memory.persist(message, agent_key, session_id)`. On compaction (detected via a `CompactionSummaryMessage` appearing in `agent_end.messages`), it calls `memory.compact(compactedSeqRange, summary, agent_key, session_id)`.
- **Restore**: On agent start, the body mints a new `session_id` by default, or uses a passed-in `session_id` (from `--resume`/`--continue` CLI flags or from the supervisor's `Map<agent_key, session_id>` on TUI team swap). The body calls `memory.restore(agent_key, session_id)`, pushes the returned `AgentMessage[]` into `agent.state.messages`, then calls `agent.continue()`.
- **Tool hooks**: `beforeToolCall` and `afterToolCall` are wired at Agent construction but not used for memory — only for Jie's EventBus telemetry (`agent.tool.call` / `agent.tool.result`). See `05-agent-model.md` pi-agent Integration Contract.

pi-agent's `CompactionSettings` are configured at agent construction with `enabled: false` for v1 (compaction deferred). When enabled, pi-agent's `transformContext` triggers summarization; the result flows through `message_end` events and `MemoryManager.compact()` records the compaction in storage.
