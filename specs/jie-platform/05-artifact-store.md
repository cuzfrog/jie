# Artifact Store

> A **work product** produced or consumed by agents (a plan, a research note, a code-change summary). The agent supplies the full key per ADR 7 (e.g. `{task_id}/plan`); the platform does not generate artifact IDs.

The `ArtifactStore` is a **domain interface** that sits on the platform's `Storage` abstraction. The platform's persistence primitive (`Storage` and its default `SqliteStorage` implementation) is documented in [`04-storage.md`](04-storage.md); this document is the artifact-specific view on top.

## Interface

```typescript
// packages/jie-platform/storage/artifact-store.ts

import type { Storage } from "./storage.ts";

export interface ArtifactStore {
  /** Store `content` at `key`. Overwrites if the key exists.
   *  Returns the canonical `{ key, created_at }` so the LLM can reference
   *  the artifact in subsequent event payloads. */
  write(key: string, content: string): Promise<{ key: string; created_at: string }>;

  /** Read the entry at `key`, or `null` if not found. A missing artifact
   *  is a normal result, not a tool error — the LLM reasons about it. */
  read(key: string): Promise<{ key: string; content: string; created_at: string } | null>;

  /** Return all keys with the given prefix, ordered by `created_at DESC`. */
  list(prefix: string): Promise<{ key: string; created_at: string }[]>;
}
```

- `write` — stores content at key. Overwrites if the key already exists. `INSERT OR REPLACE` semantics.
- `read` — returns the entry for key, or `null` if not found.
- `list` — returns all keys with the given prefix, ordered by `created_at DESC`.

The interface is the only dependency visible to `core`. The backing store is a `Storage` reference injected at construction; the same `Storage` is shared with `SqliteMemoryManager` (see [`08-memory.md`](08-memory.md)).

## Default Implementation: `SqliteArtifactStore`

```typescript
// packages/jie-platform/storage/artifact-store.ts

interface ArtifactRow {
  key: string;
  content: string;
  created_at: string;
}

export class SqliteArtifactStore implements ArtifactStore {
  private readonly table: Storage; // bound at construction

  constructor(storage: Storage) { this.table = storage; }

  async write(key, content): Promise<{ key: string; created_at: string }> {
    const created_at = new Date().toISOString();
    this.table.exec(
      `INSERT OR REPLACE INTO artifacts (key, content, created_at) VALUES (?, ?, ?)`,
      [key, content, created_at],
    );
    return { key, created_at };
  }

  async read(key) {
    const rows = this.table.query(
      `SELECT key, content, created_at FROM artifacts WHERE key = ?`, [key],
    );
    return rows.length === 0
      ? null
      : {
          key: rows[0][0] as string,
          content: rows[0][1] as string,
          created_at: rows[0][2] as string,
        };
  }

  async list(prefix) {
    const rows = this.table.query(
      `SELECT key, created_at FROM artifacts WHERE key LIKE ? ORDER BY created_at DESC`,
      [`${prefix}%`],
    );
    return rows.map(r => ({ key: r[0] as string, created_at: r[1] as string }));
  }
}
```

The `Storage` reference is the only persistence handle the store sees. SQL is written at the call site; the row shape is typed at the extraction point. There is no `Table<TRow>` layer between `SqliteArtifactStore` and `Storage` — the abstraction is `Storage`, not a typed-table view on top of it.

The `artifacts` table is created by `initializeSchema` in [`04-storage.md`](04-storage.md) "Schema Bootstrap" (single-version `CREATE TABLE IF NOT EXISTS`, called by `SqliteStorage`'s constructor on open).

## Concurrency

Single SQLite database shared by all agents. The `SqliteStorage` constructor sets `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` on open (see [`04-storage.md`](04-storage.md) "Default Implementation"). Writes are single-writer by design; the busy_timeout retries for up to 5 seconds on conflict.

## Timestamps

`created_at` is ISO 8601 in UTC (e.g. `2026-05-29T14:30:00.000Z`). The store generates the timestamp on `write`; callers do not supply it.

## Tool Wrappers

The store is exposed to agents through two built-in tools, defined in `06-agent-model.md`:

- `write_artifact(key, content)` — stores content at key. The agent builds the key (e.g. `{task_id}/plan`, `{task_id}/research`).
- `read_artifact(key)` — returns the content at key, or `null` if not found. (Missing artifact is a normal result, not a tool error; the LLM can reason about it.)

These are the only two artifact tools exposed to agents. See `06-agent-model.md` for the full TypeBox schemas, return shapes, and tool descriptions.

Artifacts are never passed in event payloads. Events carry only `artifact_id` (the artifact key) per the event-envelope contract in `03-event-system.md`.

## Tools Not in the Store

- `descriptor_patch` and `file_snapshot` artifacts are intentionally out of scope. File history is owned by `git`. Agents do not snapshot files into a parallel store.

## Retention

v1 keeps all rows indefinitely. No deletion or compaction runs in v1. See [`04-storage.md`](04-storage.md) "Retention" for the same policy applied to the storage layer as a whole.
