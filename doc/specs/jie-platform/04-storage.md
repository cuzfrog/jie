# Storage & Artifacts

`Storage` is the platform's persistence abstraction; `SqliteStorage` (bun:sqlite) is the only implementation. Two domain stores sit on top and share one `Storage` instance per process — one SQLite file (`~/.jie/storage.db`, or `:memory:` with the `inMemory` option), three tables: `artifacts`, `memory_turns`, and `session_metadata`. "Storage" is the umbrella (the layer); "artifact" is a work product an agent writes to the store.

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
```

`memory_turns` shape and session model: ADR 17 and `08-memory.md`. `session_metadata` holds the optional human name a session was given (`/rename` → the `renameSession` command); it is keyed by `session_id` alone (ULIDs are globally unique) and LEFT-JOINed into `listSessions` (`08-memory.md`, "List and rename"). Future schema changes append versioned migrations advancing `PRAGMA user_version`; today there is one version.

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
- **Lifecycle status rows:** the only keys the platform itself writes are `{task_id}/status/{seq}` (zero-padded sequence, content the JSON `{ phase, iteration, updated_at }`), appended by the lifecycle guard inside `notify` after authorizing a transition (ADR 33; `06-agent-model.md` "notify"). The newest row by `created_at` is the task's canonical state. Nothing prevents agents from writing these keys through `write_artifact`; enforcement assumes cooperative agents.
- **Client owns the key scheme.** Keys are validated against `^[A-Za-z0-9_./-]{1,256}$` (`invalid_artifact_key` on mismatch) and content against a 5 MiB cap (`artifact_too_large`, matching `web_fetch`'s body cap; SQLite itself allows 1 GB rows — the platform cap bounds memory). No schema, no reserved prefixes, no automatic team scoping: `artifacts` is a single namespace shared by every team, and two teams writing `task_1/plan` overwrite each other. Teams that need isolation include `team_id` in their key scheme (`ExecutionContext.team_id` is available; `write_artifact` does not insert it).
- **`list` escapes `LIKE` metacharacters** (`%`, `_`, `\`) in the prefix so user input matches literally; the primary-key index serves the prefix range scan.
- **Timestamps:** `created_at` is ISO 8601 UTC, generated by the store on `write`; callers do not supply it.

Agents see the store through two built-in tools — `write_artifact(key, content)` and `read_artifact(key)` — documented in `06-agent-model.md`. Artifacts are never passed in event payloads; events reference them by key.

## Retention and Scope

All rows are kept indefinitely — conversation compaction (`08-memory.md` "Compact") flags summarized turns `compacted=1` but never deletes them; no other GC or archival. `descriptor_patch` / `file_snapshot` artifacts are intentionally out of scope — file history is owned by git; agents do not snapshot files into a parallel store.
