# Storage & Artifacts

`Storage` is the platform's persistence abstraction; `SqliteStorage` (bun:sqlite) is the only implementation. Four domain stores sit on top and share one `Storage` instance per process — one SQLite file (`~/.jie/storage.db`, or `:memory:` with the `inMemory` option), seven tables: `artifacts`, `memory_turns`, `session_metadata` (the transcript/artifact domains), `memory_atoms` plus its FTS index (long-term memory), and `kanban_cards` plus `kanban_counters` (the kanban domain). "Storage" is the umbrella (the layer); "artifact" is a work product an agent writes to the store.

## Storage Interface

```typescript
// packages/jie-platform/storage/storage.ts
export interface Storage {
  exec(sql: string, params?: unknown[]): void;                              // write / DDL
  query(sql: string, params?: unknown[]): ReadonlyArray<ReadonlyArray<unknown>>;  // read; row typing happens at extraction
  transaction<T>(fn: (storage: Storage) => T): T;                           // single transaction; fn sees its own writes
  close(): void;                                                            // idempotent
}
```

SQL is the contract — no typed `Table<TRow>` layer in between (joins, transactions, and batched updates all want SQL semantics; a typed layer would grow to match every domain need with no compensating clarity). Domain code never imports `bun:sqlite`. A different backend implements the same four operations; domain stores do not change.

`SqliteStorage` opens the file, runs `initializeSchema`, and sets `PRAGMA journal_mode=WAL` (concurrent reads, single writer) and `PRAGMA busy_timeout=5000` (retry up to 5s on write conflict).

## Schema Bootstrap

One idempotent function, `initializeSchema(storage)`, called by `SqliteStorage`'s constructor — the single place that knows the whole schema (domain stores write SQL at call sites, they do not own migrations):

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  key        TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_turns (
  team_id    TEXT    NOT NULL,
  session_id TEXT    NOT NULL,
  agent_key  TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  compacted  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (team_id, agent_key, session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_memory_turns_team_session_created
  ON memory_turns (team_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS session_metadata (
  session_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_atoms (
  id                TEXT    PRIMARY KEY,
  team_id           TEXT    NOT NULL,
  content           TEXT    NOT NULL,
  type              TEXT    NOT NULL,
  priority          INTEGER NOT NULL DEFAULT 50,
  scene             TEXT    NOT NULL DEFAULT '',
  source_session_id TEXT    NOT NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_atoms_team
  ON memory_atoms (team_id, priority DESC, updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_atoms_fts USING fts5(
  content, atom_id UNINDEXED, tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  team_id     TEXT    NOT NULL,
  session_id  TEXT    NOT NULL,
  seq         INTEGER NOT NULL,
  id          TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  active_form TEXT,
  description TEXT,
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (team_id, session_id, id)
);

CREATE TABLE IF NOT EXISTS kanban_counters (
  team_id    TEXT    NOT NULL,
  session_id TEXT    NOT NULL,
  next_id    INTEGER NOT NULL,
  PRIMARY KEY (team_id, session_id)
);
```

`memory_turns` shape and session model: ADR 17 and `08-transcript.md`. `session_metadata` holds the optional human name a session was given (`/rename` → the `renameSession` command); it is keyed by `session_id` alone (ULIDs are globally unique) and LEFT-JOINed into `listSessions` (`08-transcript.md`, "List and rename"). `memory_atoms` holds long-term memory atoms with their FTS5 index — team scoping, search semantics, and dedup in `11-memory.md` (the FTS table carries `atom_id` for joining and drops `team_id` from the index since scoping happens on the join). `kanban_cards` holds the board per session per team, its `seq` preserving insertion order for `load`; `kanban_counters` tracks the next card id per session (`Kanban Store` below). Future schema changes append versioned migrations advancing `PRAGMA user_version`; today there is one version.

## Artifact Store

A work product produced or consumed by agents (a plan, a research note, a change summary). The agent supplies the full key; the platform does not generate artifact IDs.

```typescript
// packages/jie-platform/storage/artifact-store.ts
export interface ArtifactStore {
  write(key: string, content: string): Promise<{ key: string; created_at: string }>;   // INSERT OR REPLACE
  read(key: string): Promise<{ key: string; content: string; created_at: string } | null>;  // null = missing (a normal result, not an error)
  list(prefix: string): Promise<{ key: string; created_at: string }[]>;                // created_at DESC
}
```

- **KV semantics:** `write` overwrites — `INSERT OR REPLACE`. There is no append-only status history in this table; sequenced keys are how progression is recorded.
- **Lifecycle status rows:** the only keys the platform itself writes are `{task_id}/status/{seq}` (sequence zero-padded to width 4, content the JSON `{ phase, iteration, updated_at }`), appended by the lifecycle guard inside `notify` after authorizing a transition (ADR 33; `06-agent-model.md` "notify"). The newest row by `created_at` is the task's canonical state. `write_artifact` rejects `*/status/*` keys for lifecycle-declaring teams (`artifact_key_reserved`), so only the guard produces status rows. The guard serializes status-row writes per `task_id` (an in-process per-task queue), so within the platform's single-process model concurrent transitions on one task cannot collide on a seq — the second re-reads the first's row and re-authorizes against it; enforcement assumes cooperative agents.
- **Client owns the key scheme.** Keys are validated against `^[A-Za-z0-9_./-]{1,256}$` (`invalid_artifact_key` on mismatch) and content against a 5 MiB cap (`artifact_too_large`, matching `web_fetch`'s body cap; SQLite itself allows 1 GB rows — the platform cap bounds memory). No schema and no automatic team scoping — the only reserved prefix is the `*/status/*` namespace, and only for lifecycle-declaring teams (bullet above). `artifacts` is a single namespace shared by every team, and two teams writing `task_1/plan` overwrite each other. Teams that need isolation include `team_id` in their key scheme (`ExecutionContext.team_id` is available; `write_artifact` does not insert it).
- **`list` escapes `LIKE` metacharacters** (`%`, `_`, `\`) in the prefix so user input matches literally; the primary-key index serves the prefix range scan.
- **Timestamps:** `created_at` is ISO 8601 UTC, generated by the store on `write`; callers do not supply it.

Agents see the store through two built-in tools — `write_artifact(key, content)` and `read_artifact(key)` — documented in `06-agent-model.md`. Artifacts are never passed in event payloads; events reference them by key.

## Kanban Store

The kanban board — the shared task list a team maintains through `kanban_write` and the TUI's `/kanban` command (`06-agent-model.md`, `kanban_write`). The board is scoped per team per session: `(team_id, session_id)` is the row key, so each session of each team carries its own board, visible across the team's members and surviving restarts.

```typescript
// packages/jie-platform/storage/kanban-store.ts
export interface KanbanStore {
  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard>;    // ORDER BY seq
  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard>;
  add(teamId: string, sessionId: string, content: string, description: string | undefined): KanbanCard;
  remove(teamId: string, sessionId: string, cardId: string): boolean;     // false = no such card
  complete(teamId: string, sessionId: string, cardId: string): boolean;  // false = no such card
  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null;
}
```

- **Card ids are assigned by the platform**, not the caller: `add` and `replace`'s new cards draw the next `K${n}` from the session's `kanban_counters` row (upserted on first use). This is what makes the ids stable across `kanban_write` rewrites and across members.
- **`replace` merges by content**: an incoming `KanbanCardWrite` whose `content` matches an existing card keeps that card's id (and drops the old card's `active_form`/`description` only when the write omits them); a new content gets a fresh id. This is the write path for `kanban_write`, whose input is the full desired board.
- **`add`/`remove`/`complete`/`editContent`** are the single-card mutations behind the platform's kanban commands (`kanbanAdd`, `kanbanRemove`, `kanbanComplete`, `kanbanEdit`); `remove`/`complete` report `false` when the id is unknown, `editContent` returns `null`.
- **`persist`** rewrites the session's rows in one transaction: delete all `kanban_cards` for the `(team_id, session_id)`, re-insert with `seq` renumbered 0..n-1. `seq` is purely positional — the returned cards are always in board order regardless of how the mutation was expressed.

## Retention and Scope

All rows are kept indefinitely — conversation compaction (`08-transcript.md` "Compact") flags summarized turns `compacted=1` but never deletes them; no other GC or archival. `descriptor_patch` / `file_snapshot` artifacts are intentionally out of scope — file history is owned by git; agents do not snapshot files into a parallel store.
