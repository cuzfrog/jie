# ADR 12: Storage Layer Abstractions

## Status

Accepted. Introduces a generic `Storage` abstraction under the two domain stores (`ArtifactStore`, `MemoryManager`).

## Context

The original spec had `ArtifactStore` and `MemoryManager` as the only persistence-shaped interfaces, both implemented directly over SQLite in their own way. That was fine while SQLite was the only backend, but conflated two layers:

1. **The persistence primitive** — what `exec`, `query`, `transaction`, and lifecycle look like.
2. **The domain store** — what `write(key, content)` and `persist(message)` look like for a particular concern.

Layer 1 was implicit in the SQLite code; layer 2 was the `ArtifactStore` / `MemoryManager` interfaces. With a single backend this is OK, but it leaves no clean seam for:

- A future non-SQLite backend (the spec already names NATS in the EventBus — extending the same pluggability to storage is natural).
- A test-only in-memory backend (for unit tests of the domain stores, no SQLite needed).
- A future Postgres / networked backend (Day 2+).

Additionally, the existing spec puts the **schema migrations** in `04-artifact-store.md` (a domain doc) even though the migration creates the `memory_turns` table that belongs to a different domain. The cross-concern coupling is awkward: the artifact store's doc prescribes another store's table.

## Decision

The persistence layer is split into two layers, and the schema bootstrap is centralized.

### Layer 1: `Storage` (the abstraction)

```typescript
// storage/storage.ts
interface Storage {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): unknown[][];
  transaction<T>(fn: (storage: Storage) => T): T;
  close(): void;
}
```

`Storage` is the platform's persistence abstraction. SQL is the contract; a future backend implements the same SQL surface. The default implementation is `SqliteStorage` (`bun:sqlite`-backed).

### Layer 2: Domain stores (sit on `Storage`)

`ArtifactStore` and `MemoryManager` are domain interfaces; their SQLite implementations take a `Storage` reference in their constructor and write SQL at the call site:

```typescript
class SqliteArtifactStore implements ArtifactStore {
  constructor(private readonly storage: Storage) {}
  async write(key, content) {
    const created_at = new Date().toISOString();
    this.storage.exec(
      `INSERT OR REPLACE INTO artifacts (key, content, created_at) VALUES (?, ?, ?)`,
      [key, content, created_at],
    );
    return { key, created_at };
  }
  // read, list — likewise
}
```

`SqliteMemoryManager` is structurally identical: it takes a `Storage`, runs `SELECT`/`INSERT`/`UPDATE` directly. No `Table<TRow>` layer, no row-typed abstraction — just SQL.

### Schema bootstrap: `init-db.ts`

The schema for both tables is initialized in a single function:

```typescript
// storage/init-db.ts
export function initializeSchema(storage: Storage): void {
  storage.exec(`CREATE TABLE IF NOT EXISTS artifacts (...)`);
  storage.exec(`CREATE TABLE IF NOT EXISTS memory_turns (...)`);
  storage.exec(`CREATE INDEX IF NOT EXISTS idx_memory_turns_session ON memory_turns (...)`);
}
```

`SqliteStorage`'s constructor calls `initializeSchema(this)` after opening the connection. Future schema changes append a new versioned migration that advances `PRAGMA user_version`; the function name `initializeSchema` will then become `runMigrations` with the version chain, but v1 has one version and one function.

### One Storage instance, multiple domain tables

A single `SqliteStorage` is opened at the platform's `startJie` entry (see ADR 13). One `Storage` reference is shared by both `SqliteArtifactStore` and `SqliteMemoryManager`. The `artifacts` and `memory_turns` tables live in the same DB file (`.jie/artifacts.db`); the file is opened with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` per the existing spec.

### Abstraction is the headline

`Storage` is the abstraction; `SqliteStorage` is the default implementation. The spec prose is explicit: **"SQLite is the default backend; the interface is backend-agnostic so future implementations (in-memory mocks for tests, a different SQL engine, etc.) implement the same shape with no domain-code changes."** The `Storage` interface is the only thing `ArtifactStore` and `MemoryManager` know about; they do not import `bun:sqlite` or know that SQLite exists.

## Rationale

- **SQL is the right level of abstraction.** A typed `Table<TRow>` layer is a leaky abstraction over SQL (joins, transactions, indexes, queries with parameters all want SQL semantics). The platform's domain stores are not generic enough to need a custom query language; SQL is the lingua franca.
- **No `update` predicate to design.** `compact()` in `MemoryManager` is a single `UPDATE memory_turns SET compacted = 1 WHERE ...` — no `get` + `put` round-trips, no `update(predicate, patch)` primitive to design, test, or constrain the future backend.
- **One layer of abstraction, not two.** The original sketch added a typed `Table<TRow>` between `Storage` and the domain stores. That doubled the surface without buying anything — domain stores would still need to know what their row shape is, and the `Table<TRow>` interface would have to grow to match every feature the domain needs (joins, aggregations, transactions across tables). SQL is the right place to draw the line.
- **Migrations belong with the backend, not the domain.** The schema for `artifacts` and `memory_turns` are coupled (they share the file, the WAL pragmas, the version chain). Putting them in `init-db.ts` and called from `SqliteStorage`'s constructor makes the coupling explicit and removes the artifact-store-doc-prescribes-the-memory-table oddity.
- **`unknown[][]` query result forces honest typing at the call site.** Domain stores map columns to typed fields at the row-extraction point. The interface stays simple; a future ergonomic helper (`queryRow<T>(sql, fn)`) is a 5-line utility, not a separate type hierarchy.

## Consequences

- `packages/jie-platform/storage/storage.ts` defines the `Storage` interface.
- `packages/jie-platform/storage/sqlite-storage.ts` exports `SqliteStorage` (the default backend) — opens `.jie/artifacts.db`, calls `initializeSchema`, sets WAL/busy_timeout, returns the storage view.
- `packages/jie-platform/storage/init-db.ts` exports `initializeSchema(storage)` — single source of truth for the v1 schema.
- `packages/jie-platform/storage/artifact-store.ts` exports `ArtifactStore` (interface) and `SqliteArtifactStore` (impl, takes `Storage`).
- `packages/jie-platform/storage/memory-store.ts` exports `MemoryManager` (interface) and `SqliteMemoryManager` (impl, takes `Storage`).
- Glossary (`00-overview.md`) gains **Storage** and **Storage Backend** entries; **Memory Store** is renamed to **MemoryManager** for consistency with `08-memory.md`.
