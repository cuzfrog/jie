# Memory

## Purpose

Durable persistence for an agent's conversation history — a write-through adapter: every message produced by the pi-agent loop is persisted to SQLite immediately; on start, prior history is restored into the agent. `persist`/`compact` are internal to the agent — they are **not** published on the event bus. The restored snapshot is the one exception: it rides `system.team.loaded` as `TeamInfo.history` so the TUI can hydrate the conversation display on resume (see Restore-and-start).

Context windowing, compaction triggering, and token estimation are owned by `@earendil-works/pi-agent-core` (`transformContext`, `CompactionSettings`); the `MemoryManager` is storage only. `AgentMessage` types are defined in `pi-agent-api-reference.md`. Schema and session model: `04-storage.md` and ADR 17.

## MemoryManager

```typescript
interface MemoryManager {
  persist(message: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  compact(compactedSeqRange: [number, number], summary: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  restore(agent_key: string, session_id: string, team_id: string): Promise<AgentMessage[]>;
  hasSession(team_id: string, session_id: string): boolean;   // --resume validation; pure read
}
```

The manager holds no in-memory copy of the conversation — pi-agent's `state.messages` is the sole in-memory source of truth. `hasSession` is called by `createJiePlatform` when validating `--resume <id>`; the CLI never runs session-id SQL itself.

### Persist

Called on every pi-agent `message_end`: the message is serialized (`JSON.stringify(AgentMessage)`) and written to `memory_turns` immediately — no buffering. `persist` never writes a `compactionSummary` row; that role is owned by `compact` (writes use `INSERT OR REPLACE`, so a redundant write from any future behavior change is harmless).

### Compact

`compact()` writes the summary row (`role='compactionSummary'`) and sets `compacted=1` on the raw range, in a single `storage.transaction()`. A crash mid-transaction rolls back; the next detection re-runs it — idempotent. Compacted raw rows are preserved for full-replay audit but are not returned by `restore`; the summary replaces them in restored history.

**Currently unwired:** `compact()` is storage-ready and unit-tested, but no caller exists — the body does not wrap pi-agent's `transformContext`. The diffing wrapper (detect each `CompactionSummaryMessage` new in the output array, compute its seq range, call `compact`) lands together with the compaction trigger, so storage and trigger ship in lockstep.

### Restore

The body's `session_id` is supplied by the platform (ADR 17): `createJiePlatform` validates `JiePlatformOptions.resumeSessionId` via `hasSession` (mismatch → `unknown session_id: <id>`, exit 1) or mints a fresh ULID, and records it in a private `Map<team_id, session_id>` closure field (in-memory only; lost on process exit). All agents in the same team in the same process share one session id — conversation is bound to the team, not the process or the agent.

`restore(agent_key, session_id, team_id)` returns all rows matching `(team_id, agent_key, session_id)` with `compacted = false`, ordered by `seq`:

- Fresh session → empty array; the body starts clean.
- Resumed session (`--resume`) → prior history; the body resumes. `seq` is per-agent: the leader's seq 1 and the worker's seq 1 are independent rows.

**`seq` caching.** The body caches the next `seq` as a private field, initialized once from the restored array (`max(restored.seq) + 1`, or `1` when empty) — no per-`persist` `MAX(seq)` query. The cache is per-body and discarded on process exit; the next run re-initializes from `restore`. When the compaction wrapper lands, it must refresh the cache if a summary displaces the high-water mark.

## Persistence

```typescript
interface TurnRecord {
  team_id:    string;        // namespace (ADR 17)
  session_id: string;        // per process × team; shared across all agents in the team
  agent_key:  string;        // {role}-{N}; each agent has its own memory stream
  seq:        number;        // monotonic within (team_id, agent_key, session_id)
  role:       string;        // 'user' | 'assistant' | 'toolResult' | 'compactionSummary' — denormalized for queries
  content:    string;        // JSON-serialized AgentMessage
  compacted:  boolean;       // replaced by a summary
  created_at: string;        // ISO 8601
}
```

Rows live in `memory_turns`, keyed by `(team_id, agent_key, session_id, seq)` — schema in `04-storage.md`, sharing the one `Storage` instance with the artifact store. Storing the full serialized message preserves every field for `restore`, which loads messages back into `agent.state.messages` where pi-agent expects the typed shape. All rows are kept indefinitely (retention: `04-storage.md`).

## Leader Working Memory

Beyond conversation history, a leader may keep in-memory state: a FIFO prompt queue for prompts received while a work unit is in flight (lost on restart; not persisted), and in-flight awareness — on reload, reading the artifact store for work units in non-terminal status. The platform reserves no artifact key for this (`__in_flight__` or similar); the key scheme is the team's concern, as with all artifact keys (`04-storage.md` "Artifact Store").

## Integration with pi-agent

- **Subscription.** The body's `message_end` listener calls `persist` unconditionally — no role check, no summary special case (pi-agent emits no `message_end` for transformContext-injected summaries).
- **`agent_end` listener.** Publishes `agent.idle` only; no compaction detection. The `turn.start` / `idle` alternation is the Event-Order Contract (`03-event-system.md`).
- **Restore-and-start** (the body's two-phase lifecycle):
  - `restore()`: `memory.restore(...)` → push a defensive copy into `agent.state.messages`; return the restored snapshot. Idempotent (the snapshot is cached).
  - `start()`:
    1. Register bus subscriptions; callbacks enqueue incoming events onto the body's in-memory `queue`.
    2. Conditionally `continue()` — only when the restored array is non-empty and ends with `user` or `toolResult` (pi-agent's `continue()` contract); an empty array or an `assistant` tail means no in-flight turn.
    3. Start the queue loop — the queue may already be non-empty (events can arrive between steps 1 and 2), so dequeue immediately rather than waiting; after each `agent_end`, dequeue the next and `agent.prompt(...)` until empty.
- **Load ordering.** `TeamManager.loadImpl` calls `restore()` on every body, publishes `system.team.loaded` (snapshots in `TeamInfo.history`), then calls `start()` on every body. Hydration precedes auto-`continue()` streaming so a resumed in-flight turn's completion appends to the already-hydrated display — the TUI drops agent events until the team is loaded. The `resumeSession`/`team` command result carries empty per-agent `history`: hydration rides the event, the result is a lightweight identity for `Actions.switchTeam`, which preserves the hydrated state rather than re-applying the snapshot.
- **Tool hooks.** `beforeToolCall` / `afterToolCall` serve EventBus telemetry only (`agent.tool.call` / `agent.tool.result`), not memory.
- **`CompactionSettings`** are constructed with `enabled: false`; when enabled, pi-agent's `transformContext` summarizes and the (future) wrapper persists via `compact()`.
