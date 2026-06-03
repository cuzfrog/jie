# Artifact Store

## Purpose

Persistent key-value store for agent work products. Agents read and write arbitrary content by key — the team blueprint defines the key scheme.

## Interface

```typescript
interface ArtifactStore {
  write(key: string, content: string): Promise<void>;
  read(key: string): Promise<{ key: string; content: string; created_at: string } | null>;
  list(prefix: string): Promise<{ key: string; created_at: string }[]>;
}
```

- `write` — stores content at key. Overwrites if the key already exists.
- `read` — returns the entry for key, or `null` if not found.
- `list` — returns all keys with the given prefix, ordered by `created_at DESC`.

The interface is the only dependency visible to `core`. The backing store is injected at startup.

## Default Implementation

`SqliteArtifactStore` in `packages/storage/`. Local file, no external service required. The `artifacts` table has columns `key TEXT PRIMARY KEY`, `content TEXT`, `created_at TEXT`. Writes use `INSERT OR REPLACE`.

**Concurrency:** Single SQLite database shared by all agents. On open, the store sets `PRAGMA journal_mode=WAL` (concurrent reads + single writer) and `PRAGMA busy_timeout=5000` (retry on write conflict for up to 5 seconds).

**Timestamps:** `created_at` is ISO 8601 in UTC (e.g. `2026-05-29T14:30:00.000Z`).

## General Tools

Built-in tools that wrap the store:

- `write_artifact(key, content)` — stores content at key. The agent builds the key (e.g. `{task_id}/plan`, `{task_id}/research`).
- `read_artifact(key)` — returns the content at key, or `null` if not found. (Missing artifact is a normal result, not a tool error; the LLM can reason about it.)

These are the only two artifact tools exposed to agents.

Artifacts are never passed in event payloads. Events carry only `artifact_id`.

## Tools Not in the Store

- `descriptor_patch` and `file_snapshot` artifacts are intentionally out of scope. File history is owned by `git`. Agents do not snapshot files into a parallel store.

## Retention

v1 keeps all rows indefinitely. No deletion or compaction runs in v1.

GC, archival, and compaction policy is deferred to the **Storage Maintenance** chapter (TBD).

## Schema Migration

SQLite's `PRAGMA user_version` tracks the schema version. On `SqliteArtifactStore` open:

1. Read `PRAGMA user_version` (defaults to 0 for a new database).
2. If version < target, run each pending migration in order.
3. Migrations are TypeScript functions that execute `CREATE TABLE`, `ALTER TABLE`, etc. directly — no migration file format.

The `artifacts` and `memory_turns` tables are created at version 1. Future schema changes increment the version and add a migration function.

```typescript
const MIGRATIONS: Array<(db: Database) => void> = [
  // v0 → v1: initial schema
  (db) => {
    db.run(`CREATE TABLE IF NOT EXISTS artifacts (key TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS memory_turns (...)`);
  },
  // Future migrations added here
];
const TARGET_VERSION = MIGRATIONS.length;
```
