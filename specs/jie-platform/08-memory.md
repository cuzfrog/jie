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

  // Return the most-recent session_id for `team_id` (by MAX(created_at) over its
  // rows in `memory_turns`), or `null` if no prior session exists. Scoped to
  // `team_id` alone (per ADR 17). Used by `jie --continue` to resolve the resume
  // target. Pure read; no state change.
  mostRecentSessionId(team_id: string): string | null;

  // Return `true` if at least one row in `memory_turns` matches
  // (team_id, session_id). Used by `jie --resume <id>` validation. Pure read;
  // no state change.
  hasSession(team_id: string, session_id: string): boolean;
}
```

`MemoryManager` is initialized by `AgentBody` at startup. It does not hold an in-memory copy of the conversation — the pi-agent's `state.messages` is the sole in-memory source of truth. The two query methods (`mostRecentSessionId`, `hasSession`) are called by `startJie` at startup to resolve `--continue` / `--resume`; the CLI does not run them directly (per ADR 20).

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

On agent start, the body's `session_id` is supplied by the `JieHandle` (per ADR 13 and ADR 18). The handle owns the session map; the body is a runtime that uses the value it's given.

**`startJie` resolves the `session_id`.** The `session_id` passed to each body is one of three values, in priority order (per ADR 20):

| Source | Resolved by | Behavior |
|---|---|---|
| `StartJieOptions.resumeSessionId` (set by `jie --resume <id>`) | `startJie` validates via `memory.hasSession(team_id, session_id)`. If `false` → exit 1 with `unknown session_id: <value>`. If `true` → use it. | Hard fail on validation failure. |
| `StartJieOptions.continueLastSession: true` (set by `jie --continue`) | `startJie` queries `memory.mostRecentSessionId(team_id)`. If `null` → WARN to stderr `no prior session in this directory; starting a new session` and mint fresh. If non-null → use it. | Non-fatal WARN on no prior session. |
| Neither flag | `startJie` mints a fresh `session_id` (ULID via `ulid@2.3.0`). | n/a |

The CLI does not run session-id SQL itself; the CLI passes intent via `StartJieOptions` and `startJie` does the work.

The `JieHandle` keeps an in-memory `Map<team_id, session_id>`. For each new body:

- If the map has a recorded `session_id` for the body's `team_id` (the team is already loaded in this process — either the startup team on initial `startJie`, or a team that was previously loaded via `JieHandle.loadTeam` and is now being re-loaded; per ADR 19, the team keeps running in `loadedTeams` so the session id persists on the map), the handle passes the recorded value to the body. The body uses it; `memory.restore()` returns the prior `memory_turns` rows for `(team_id, agent_key, session_id)`.
- If the map has no entry for the body's `team_id` (first load of this team in the process), the handle mints a fresh `session_id` (ULID via `ulid@2.3.0`; 26 chars; shorter than UUID v4 and human-scannable in logs and DB rows), records the mapping, and passes it to the body. The `--resume <session_id>` and `--continue` CLI flags override the minted value: the CLI resolves a `session_id` (the named one for `--resume`, or the most-recent for `--continue` — see `ui/cli.md` and ADR 17), the handle records that value under the team's `team_id`, and the body uses it.

**Per-team session id.** The session id is per process run × team: all agents in the same team in the same process share one session id. On team swap, the new team's session id is independent of the old team's — conversation is bound to the team, not the process. Two teams that share an `agent_key` (e.g., both have a `general` role) are disambiguated by their different `team_id`s: they get different `session_id`s and live in disjoint row sets in `memory_turns`. Switching back to a previously-active team reuses that team's recorded session id (the map's value); the previously-active team's bodies are **not** stopped (per ADR 19) but its session id is preserved on the map for the lifetime of the process.

The body then calls `memory.restore(agent_key, session_id, team_id)`. This queries `memory_turns` for all rows matching `(team_id, agent_key, session_id)` where `compacted = false`, ordered by `seq`:

- Fresh `session_id` (newly minted, no prior rows for this team in the current session) → empty array; the body begins with a clean conversation.
- Existing `session_id` (the swap-back case, or a `--resume` / `--continue` lookup) → prior history; the body resumes where it left off. **`seq` is per-agent**: each agent has its own `seq` counter within the session, so the leader's seq 1 and the worker's seq 1 are independent rows.

**`seq` counter caching.** The body caches the next `seq` value as a private field (call it `nextSeq`), not as a re-queried `MAX(seq)` on every `persist`. The cache is initialized once during `restore()`: after the body reads the returned `AgentMessage[]`, it scans the array for the highest `seq` and sets `nextSeq = max(restored.seq) + 1` (or `1` if the array is empty). Each subsequent `persist(message, ...)` increments `nextSeq` and writes the row with that value. There is no per-`persist` SQL query for the counter; the cache is the source of truth for the body's lifetime. The cache is discarded on process exit; the next process run re-initializes from `MAX(seq)` on the next `restore()`. The cache is per-body — the leader's `nextSeq` and the worker's `nextSeq` are independent, matching the per-agent `seq` semantic. In v1 (no compaction writes) the cache cannot drift; the Day-2 `compact()` path may need to refresh the cache if it inserts a summary that displaces the body's high-water mark (out of scope for v1; tracked separately).

The handle's `Map<team_id, session_id>` is in-memory only; it is lost on process exit. A fresh process run starts with an empty map. Each new team seen by the handle mints a fresh session id and records the mapping; team swap back to a previously-active team reuses the recorded session id. Memory is per-team at the session level, per-agent at the row level.

Compacted raw messages are preserved in storage (for full-replay audit) but are not returned by `restore` — the `CompactionSummaryMessage` replaces them in the restored history.

## Persistence

```typescript
interface TurnRecord {
  team_id:    string;        // namespace; team whose bodies wrote this row
  session_id: string;        // per-process × team identifier (per ADR 18); shared across all agents in the same team in the same process
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

**Team scoping.** `team_id` is the namespace for `memory_turns`. Two teams that both contain a role named `general` (and thus both have `agent_key = general-1`) live in disjoint row sets because their `team_id` differs. Users can name roles freely across teams — including reusing names — without collision. The `JieHandle`'s in-memory `Map<team_id, session_id>` (per ADR 18) is keyed by `team_id` alone — the per-team model means all agents in a team share one session id, so per-`agent_key` disambiguation is not needed. Per-team `--continue` lookups filter on `team_id`; the `idx_memory_turns_team_session_created` index on `(team_id, session_id, created_at)` makes those lookups efficient.

## Leader Agent Working Memory

The leader agent (as designated by the team blueprint) may maintain in-memory state beyond conversation history:

- **Prompt queue**: FIFO queue of user prompts received while a work unit is in flight. On completion of the current work unit, the leader dequeues the next prompt. This queue is lost on restart; in v1, queued prompts are not persisted.
- **In-flight awareness**: the leader tracks whether any work unit is currently in flight using status reads plus its own working memory. On reload, the leader reads the artifact store to discover any work unit that was in a non-terminal status at the time of crash and resumes monitoring it.

**No platform-reserved key for in-flight tracking.** The platform does not reserve an artifact key (e.g., `__in_flight__`) for in-flight awareness — this is the team's concern. The platform's role is to make the artifact store available; the team defines the key scheme. This is consistent with ADR 7 (which removed `work_id` from `ExecutionContext`): the platform is generic; the team owns its own identifier scheme.

## Integration with pi-agent

`MemoryManager` integrates via pi-agent's event subscription and the body's `transformContext` wrapper:

- **Subscription**: The body calls `agent.subscribe(listener)`. On `message_end`, it calls `memory.persist(message, agent_key, session_id, team_id)` unconditionally — no role check, no special case for summaries.
- **`transformContext` wrapper**: The body passes a wrapped `transformContext` to pi-agent via `AgentOptions`. The wrapper calls the inner `transformContext` (pi-agent's default, or the Day 2+ compaction implementation), diffs the input and output arrays, and for each `CompactionSummaryMessage` that appears in the output but not the input, computes the seq range and calls `memory.compact(range, summary, agent_key, session_id, team_id)`. The wrapper returns the new array unchanged. **The wrapper is invariant across days**: in v1 the inner is the identity function (no compaction → wrapper is a no-op); in Day 2+ the inner is the actual compaction logic → wrapper persists the produced summaries. Compaction is trigger-agnostic — whether the trigger is the user's `/compact` slash command, pi-agent's auto-threshold, or a Day 2+ team hook, all paths funnel through `transformContext` and the wrapper persists.
- **`agent_end` listener**: publishes `agent.idle` only. Does not detect compaction (the `transformContext` wrapper owns that). The `agent.turn.start` / `agent.idle` alternation is the Event-Order Contract — see `03-event-system.md`.
- **Restore**: On agent start, the body uses the `session_id` supplied by the `JieHandle` (per ADR 18 and ADR 20). The body's `start()` runs the four-step restore-and-start sequence documented in `06-agent-model.md` "AgentBody" `start()`:

  1. **Register bus subscriptions** — see `06-agent-model.md`. Subscription callbacks enqueue incoming events onto the body's in-memory `queue` field.
  2. **Restore history** — call `memory.restore(agent_key, session_id, team_id)` → `AgentMessage[]`. Push the returned array into `agent.state.messages`.
  3. **Conditionally `continue()`** — if the restored array is non-empty and the last message is `user` or `toolResult`, call `agent.continue()` to resume the in-flight turn (per pi-agent's API contract in `pi-agent-api-reference.md` — `continue()` requires a `user`/`toolResult` tail). When the array is empty (fresh `session_id`) or ends with `assistant` (a completed prior turn), the body does **not** call `continue()`.
  4. **Start the queue-processing loop** — if the in-memory `queue` is non-empty (events may have arrived between step 1's subscription registration and step 3's `continue()`), dequeue the first message and call `agent.prompt(message)`. Otherwise, wait for new events from the subscription callback. After `agent_end`, the loop dequeues the next message and calls `agent.prompt(nextMessage)`, until the queue is empty.

  This handles all three restore cases correctly: fresh session (empty → wait for first event), completed turn (assistant tail → wait), in-flight turn (user or toolResult tail → resume via `continue()`, then drain the queue). Crucially, the queue may already be non-empty at the start of step 4 — the loop dequeues immediately rather than waiting for a new arrival.
- **Tool hooks**: `beforeToolCall` and `afterToolCall` are wired at Agent construction but not used for memory — only for Jie's EventBus telemetry (`agent.tool.call` / `agent.tool.result`). See `06-agent-model.md` pi-agent Integration Contract.

pi-agent's `CompactionSettings` are configured at agent construction with `enabled: false` for v1 (compaction deferred). When enabled, pi-agent's `transformContext` triggers summarization; the resulting `CompactionSummaryMessage` is detected by the body's `transformContext` wrapper, which calls `MemoryManager.compact()` to record the compaction in storage.
