# Artifact Store

## Purpose

Persistent, content-addressed store for agent work products. Artifacts are indexed by a work-unit identifier (team-defined; e.g. `task_id`) so work products accumulate across multiple sessions.

## Interface

```typescript
type ArtifactType = string;   // team-defined: 'task' | 'research' | 'plan' | 'review' | etc.
type ArtifactId = string;     // opaque, store-assigned (ULID)

interface Artifact {
  id:         ArtifactId;
  work_id:    string;         // durable team-defined work-unit identifier
  type:       ArtifactType;
  content:    string;
  created_at: string;         // ISO 8601
}

interface ArtifactStore {
  write(type: ArtifactType, content: string, work_id: string): Promise<ArtifactId>;
  read(id: ArtifactId): Promise<Artifact>;
  list(filter: { work_id?: string; type?: ArtifactType }): Promise<Artifact[]>;

  // Status tracking — team defines the status schema via a blueprint.
  // The store treats status rows as an opaque append-only log.
  append_status(work_id: string, status: string, metadata: Record<string, unknown>): Promise<void>;
  read_status(work_id: string): Promise<{ status: string; metadata: Record<string, unknown> } | null>;
}
```

The interface is the only dependency visible to `core`. The backing store is injected at startup.

## Default Implementation

`SqliteArtifactStore` in `packages/storage/`. Local file, no external service required. Writes are serialized by SQLite; the store is the single source of truth for artifact bytes and for status tracking. The store generates ULIDs as primary keys for artifact rows — timestamp-prefixed, sortable, 26-character strings (`01ARZ3NDEKTSV4RRFFQ69G5FAV`). The `id` column in the `artifacts` table is TEXT, not an auto-increment integer.

Status rows are stored in the same `artifacts` table as other types, using a reserved `type` prefix. The latest status per `work_id` (by `created_at`) is canonical. An index on `(work_id, type, created_at DESC)` makes `read_status` O(log N). `append_status` inserts a new row unconditionally.

## General Tools

Built-in tools that wrap the store:

- `read_artifact(artifact_id)` — available to any soul that needs it.
- `write_artifact(type, content)` — available to any soul that produces artifacts. The tool implementation reads the current work-unit identifier from `ExecutionContext` and stamps it on the row; the soul does not pass it explicitly.
- `read_status(work_id)` — available to all agents. Returns the current status record for the given work-unit, or `null` if no status row has been written.

Artifacts are never passed in event payloads. Events carry only `artifact_id`.

## Tools Not in the Store

- `descriptor_patch` and `file_snapshot` artifacts are intentionally out of scope. File history is owned by `git`. Agents do not snapshot files into a parallel store.
- Status transitions: souls do **not** call `write_artifact` for status records. Status transitions are written exclusively by the body inside the `notify` flow via `append_status`.

## Retention

v1 keeps all rows indefinitely. No deletion or compaction runs in v1. The append-only status chain for a completed work unit accumulates up to ~9 rows per session; this is negligible at development-team scale.

GC, archival, and compaction policy is deferred to the **Storage Maintenance** chapter (TBD).
