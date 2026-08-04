# Memory

## Purpose

Durable persistence for an agent's conversation history — a write-through adapter: every message produced by the pi-agent loop is persisted to SQLite immediately; on start, prior history is restored into the agent. `persist`/`compact` are internal to the agent — they are **not** published on the event bus. The restored snapshot is the one exception: it rides `system.team.loaded` as `TeamInfo.history` so the TUI can hydrate the conversation display on resume (see Restore-and-start).

Compaction triggering is owned by the platform: the body invokes its `Compactor` between runs, which decides whether to summarize and persists via `compact`, reusing `@earendil-works/pi-agent-core`'s compaction toolkit (`shouldCompact`, `estimateContextTokens`, `createCompactionSummaryMessage`); pi-agent's own `transformContext` compaction path is not used. The `MemoryManager` is storage only. `AgentMessage` types are defined in `pi-agent-api-reference.md`. Schema and session model: `04-storage.md` and ADR 17.

## MemoryManager

```typescript
interface MemoryManager {
  persist(message: AgentMessage, agentKey: string, sessionId: string, teamId: string): void;
  compact(compactedCount: number, summary: AgentMessage, agentKey: string, sessionId: string, teamId: string): void;
  restore(agentKey: string, sessionId: string, teamId: string): Promise<AgentMessage[]>;
  hasSession(teamId: string, sessionId: string): boolean;   // --resume validation; pure read
  listSessions(teamId: string): ReadonlyArray<SessionSummary>;   // /resume picker; one aggregate row per session, newest first
  sessionName(sessionId: string): string | null;            // session_metadata read; null when unnamed
  renameSession(sessionId: string, name: string): void;     // upsert session_metadata
}
```

The manager holds no in-memory copy of the conversation — pi-agent's `state.messages` is the sole in-memory source of truth. `hasSession` is called by the platform's `TeamManager` (via the `resumeSessionId` cradle value) when validating `--resume <id>` at team load; the CLI never runs session-id SQL itself.

### Persist

Called on every pi-agent `message_end`: the message is serialized (`JSON.stringify(AgentMessage)`) and written to `memory_turns` immediately — no buffering. The store persists what it is handed verbatim; the body projects the message before the call (non-display `toolResult` details are dropped — `06-agent-model.md` "Memory Integration"). `persist` never writes a `compactionSummary` row; that role is owned by `compact` (writes use `INSERT OR REPLACE`, so a redundant write from any future behavior change is harmless).

### Compact

`compact()` is called by the `Compactor` between agent runs. `compactedCount` is the number of oldest non-compacted rows the summary covers (the summarized prefix — the `Compactor`'s cut point). In a single `storage.transaction()`: mark the oldest `compactedCount` non-compacted rows (`ORDER BY seq LIMIT`) `compacted=1`; capture the remaining non-compacted tail; delete those tail rows; insert the summary row (`role='compactionSummary'`) at `MAX(seq) + 1`; re-insert the tail rows resequenced contiguously after the summary. Seq order after compact: compacted prefix (original seqs) < summary < resequenced tail, so `restore` returns `[summary, ...tail]`. A crash mid-transaction rolls back; the next trigger re-runs it — idempotent. Compacted raw rows are preserved for full-replay audit but are not returned by `restore`.

### Restore

The body's `session_id` is supplied by the platform (ADR 17): the platform's `TeamManager` validates `JiePlatformOptions.resumeSessionId` (a cradle value registered by `bootPlatform`) via `hasSession` (mismatch → `unknown session_id: <id>`, exit 1) or mints a fresh ULID, and records it in a private `Map<team_id, session_id>` field (in-memory only; lost on process exit). All agents in the same team in the same process share one session id — conversation is bound to the team, not the process or the agent.

`restore(agentKey, sessionId, teamId)` returns all rows matching `(team_id, agent_key, session_id)` with `compacted = false`, ordered by `seq`:

- Fresh session → empty array; the body starts clean.
- Resumed session (`--resume`) → prior history; the body resumes. `seq` is per-agent: the leader's seq 1 and the worker's seq 1 are independent rows.
- Compacted session → the first row is the `compactionSummary`; the summarized prefix rows (`compacted=1`) are excluded.

**`seq` assignment.** `persist` computes the next `seq` as `MAX(seq) + 1` for the stream on every call; `compact` resequences the summary and tail within its transaction. Seq order is conversation order at all times, so `restore`'s `ORDER BY seq` is the conversation order.

### List and rename

`listSessions(teamId)` aggregates `memory_turns` into one `SessionSummary { sessionId, messageCount, lastActivity, name? }` per session, newest activity first; `messageCount` counts non-compacted rows only — the restored conversation including the summary row; `name` comes from a LEFT JOIN on `session_metadata` and is absent for unnamed sessions. `renameSession(sessionId, name)` upserts that table. The `renameSession` **command** (TUI `/rename <name>`) resolves the active `session_id` from `TeamManager`'s private `Map<team_id, session_id>` — no session loaded for that team fails `NO_TEAM` — trims the name (blank fails `INVALID_SESSION_NAME`), and calls the manager. Naming is a presentation concern over the durable id: `/resume` still commits the `session_id`, and the name follows the session across process restarts (the table persists; the in-memory map does not). `sessionName(sessionId)` is the single-row read behind `TeamInfo.sessionName` — `TeamManager.toTeamInfo` resolves the team's active `session_id` from the same private map and reports its name (null when unnamed), so every `load`/`resumeSession` result and `system.team.loaded` payload carries the current name; the TUI labels the editor's top border with it (`tui-layout.md`, Borders).

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

- **Subscription.** The body's `message_end` listener calls `persist` unconditionally — no role check, no summary special case (pi-agent emits no `message_end` for summaries: `transformContext` is identity, and the summary row is written by `compact`).
- **`agent_end` listener.** Publishes `agent.idle`, then once pi settles the run the body runs the compaction check (`06-agent-model.md` "Compaction") before draining the next queued prompt. The `turn.start` / `idle` alternation is the Event-Order Contract (`03-event-system.md`).
- **Restore-and-start** (the body's two-phase lifecycle):
  - `restore()`: `memory.restore(...)` → push a defensive copy into `agent.state.messages`; return the restored snapshot. Idempotent (the snapshot is cached).
  - `start()`:
    1. Register bus subscriptions; callbacks enqueue incoming events onto the body's in-memory `queue`.
    2. Conditionally `continue()` — only when the restored array is non-empty and ends with `user` or `toolResult` (pi-agent's `continue()` contract); an empty array or an `assistant` tail means no in-flight turn.
    3. Start the queue loop — the queue may already be non-empty (events can arrive between steps 1 and 2), so dequeue immediately rather than waiting; after each `agent_end`, dequeue the next and `agent.prompt(...)` until empty.
- **Load ordering.** `TeamManager.loadImpl` calls `restore()` on every body, publishes `system.team.loaded` (snapshots in `TeamInfo.history`), then calls `start()` on every body. Hydration precedes auto-`continue()` streaming so a resumed in-flight turn's completion appends to the already-hydrated display — the TUI drops agent events until the team is loaded. The `resumeSession`/`team` command result carries the same live per-agent `history` as the event (restored rows on a fresh load; on a cache hit, the running agents' current messages, read via `AgentBody.messages()`), so `Actions.switchTeam` hydrates uniformly — including cache-hit re-selections, where no event is emitted.
- **Tool hooks.** `beforeToolCall` / `afterToolCall` serve EventBus telemetry only (`agent.tool.call` / `agent.tool.result`), not memory.
- **Compaction** is platform-driven, not pi-agent-driven: the body passes an identity `transformContext`, so pi's `CompactionSettings` path never runs. The body's `Compactor` (`06-agent-model.md` "Compaction") triggers between runs and persists via `compact()`; the `convertToLlm` the body passes to the `Agent` maps `compactionSummary` messages to a user message carrying the summary text, so the LLM sees restored and freshly written summaries alike without pi-agent special-casing the role.
