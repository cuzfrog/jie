# Storage

> **The platform's persistence abstraction.** `Storage` is the interface; **`SqliteStorage` is the default implementation.** The interface is backend-agnostic so future implementations (in-memory mocks for tests, a different SQL engine, etc.) implement the same shape with no domain-code changes.

The `ArtifactStore` (see [`05-artifact-store.md`](05-artifact-store.md)) and the `MemoryManager` (see [`08-memory.md`](08-memory.md)) are domain interfaces that sit on top of `Storage`. They share one `Storage` instance per process and therefore one SQLite file (`.jie/storage.db`) with two tables: `artifacts` and `memory_turns`.

> **Terminology.** "Storage" is the umbrella concept: the persistence layer (the `Storage` interface, the `SqliteStorage` default, the on-disk file). "Artifact" is a working-flow term: a `Storage` row that captures a piece of work output (a `role-played-answer` summary, a `user-question` record, etc.). The file `storage.db` is named after the umbrella; its `artifacts` and `memory_turns` tables reflect the two domain stores that share it.

## Interface

```typescript
// packages/jie-platform/storage/storage.ts

export interface Storage {
  /** Execute a write statement (INSERT, UPDATE, DELETE, DDL). */
  exec(sql: string, params?: unknown[]): void;

  /** Execute a read statement. Returns rows as `unknown[][]` — domain
   *  stores type their row shape at the row-extraction point. */
  query(sql: string, params?: unknown[]): unknown[][];

  /** Run `fn` in a single transaction. The `Storage` argument is the
   *  in-transaction view: writes inside `fn` are visible to `fn`'s own
   *  reads; other Storage calls outside `fn` see the pre-transaction
   *  state until commit. */
  transaction<T>(fn: (storage: Storage) => T): T;

  /** Close the underlying connection. Idempotent. */
  close(): void;
}
```

SQL is the contract. The interface exposes the four operations any SQL engine provides: parameterised write, parameterised read, transactional grouping, and lifecycle. Domain code never imports `bun:sqlite`; the `Storage` reference is the only handle.

## Default Implementation: SQLite

```typescript
// packages/jie-platform/storage/sqlite-storage.ts

export class SqliteStorage implements Storage {
  /** Opens `filePath`, runs `init-db.ts` migrations, sets WAL +
   *  busy_timeout pragmas, returns the storage view. */
  constructor(filePath: string) { ... }

  exec(sql: string, params?: unknown[]): void           { ... }
  query(sql: string, params?: unknown[]): unknown[][]  { ... }
  transaction<T>(fn: (s: Storage) => T): T             { ... }
  close(): void                                         { ... }
}
```

`SqliteStorage` is the platform's default backend. It is backed by `bun:sqlite`. Pragmas on open:

- `PRAGMA journal_mode=WAL` — concurrent reads + single writer.
- `PRAGMA busy_timeout=5000` — retry on write conflict for up to 5 seconds.

**The interface is the abstraction; the SQLite implementation is one of many possible backends.** A future `PostgresStorage` (network), `InMemoryStorage` (tests), or a different SQL engine implements the same `Storage` shape. Domain code (`SqliteArtifactStore`, `SqliteMemoryManager`, the tools that touch the store) does not change.

## Schema Bootstrap: `init-db.ts`

The v1 schema is created by a single function in `packages/jie-platform/storage/init-db.ts`:

```typescript
// packages/jie-platform/storage/init-db.ts

import type { Storage } from "./storage.ts";

/** Apply the v1 schema. Idempotent (`CREATE TABLE IF NOT EXISTS`). Called
 *  by `SqliteStorage`'s constructor after opening the connection. */
export function initializeSchema(storage: Storage): void {
  storage.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      key        TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS memory_turns (
      team_id    TEXT    NOT NULL,
      agent_key  TEXT    NOT NULL,
      session_id TEXT    NOT NULL,
      seq        INTEGER NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      compacted  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL,
      PRIMARY KEY (team_id, agent_key, session_id, seq)
    )
  `);

  storage.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_turns_team_session_created
    ON memory_turns (team_id, session_id, created_at)
  `);
}
```

`SqliteStorage`'s constructor calls `initializeSchema(this)` after opening the SQLite connection. The schema is single-version in v1: one function, one set of `CREATE TABLE IF NOT EXISTS` statements. Future schema changes append a new versioned migration that advances `PRAGMA user_version`; the function name `initializeSchema` will then become `runMigrations(storage)` with the version chain, but in v1 there is only one version and one function.

The `artifacts` table is owned by `SqliteArtifactStore` (see [`05-artifact-store.md`](05-artifact-store.md)). The `memory_turns` table is owned by `SqliteMemoryManager` (see [`08-memory.md`](08-memory.md)). Both stores take a `Storage` reference in their constructor and write SQL at the call site — they do not own the migration. The migration is a single place that knows the whole schema.

## Sharing One Storage Instance

The platform's `startJie` entry (see `06-agent-model.md` and ADR 13) opens one `SqliteStorage` at the configured path (`.jie/storage.db` by default) and hands the same `Storage` reference to both `SqliteArtifactStore` and `SqliteMemoryManager`. One connection, one WAL file, one busy_timeout, two tables, two domain interfaces.

A future migration that splits the two tables across files (artifacts in one DB, memory in another) is a `Storage`-impl concern: open two `SqliteStorage` instances, hand each domain store a different one. Domain code is unchanged.

## Why This Shape

- **SQL is the right level of abstraction.** A typed `Table<TRow>` layer would be a leaky abstraction over SQL (joins, transactions, indexes, parameterised queries all want SQL semantics). Domain stores already know the row shape they want; they just need a way to run SQL.
- **No `update` predicate to design.** The MemoryManager's `compact()` is a single `UPDATE memory_turns SET compacted = 1 WHERE ...` — one statement, no `get` + `put` round-trips, no `update(predicate, patch)` primitive to design or constrain the future backend.
- **One layer of abstraction, not two.** The interface is `Storage`; the domain stores use it directly. A `Table<TRow>` layer would have grown to match every feature the domain needs (joins, transactions, batched updates) — a maintenance burden with no compensating clarity.
- **The abstraction is the headline.** `Storage` is the only thing `ArtifactStore` and `MemoryManager` see. The SQLite implementation is one concrete `Storage`. The platform's domain code does not import `bun:sqlite` and does not know that SQLite exists.

## Tools Not in the Store

- `descriptor_patch` and `file_snapshot` artifacts are intentionally out of scope. File history is owned by `git`. Agents do not snapshot files into a parallel store.

## Retention

v1 keeps all rows indefinitely. No deletion or compaction runs in v1.

GC, archival, and compaction policy are deferred to **backlog item #7** (Storage Maintenance chapter — artifact retention, GC, archival, backup; status chain compaction; JetStream pruning). When the future `PostgresStorage` ships, retention may be enforced by the backend instead of by application logic.
