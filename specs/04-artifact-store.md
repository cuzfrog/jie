# Artifact Store

## Purpose

Persistent, content-addressed store for agent work products. Indexed by `task_id` so artifacts accumulate across sessions belonging to the same task (a task can span multiple sessions; sessions are transient runs *within* a task).

## Interface

```typescript
type ArtifactType = 'task' | 'task_status' | 'research' | 'plan' | 'review';

type ArtifactId = string;  // opaque, store-assigned (ULID)

type TaskPhase =
  | 'recorded' | 'researched' | 'designed' | 'planned'
  | 'implemented' | 'review_passed' | 'review_failed'
  | 'done' | 'failed';

interface Artifact {
  id:         ArtifactId;
  task_id:    string;       // durable; survives across sessions
  type:       ArtifactType;
  iteration:  number;       // start with 1
  content:    string;
  created_at: string;       // ISO 8601
}

interface TaskStatus {
  task_id:    string;
  phase:      TaskPhase;
  iteration:  number;
  updated_at: string;       // ISO 8601 (the created_at of the latest task_status row)
}

interface ArtifactStore {
  write(type: ArtifactType, content: string, task_id: string): Promise<ArtifactId>;
  read(id: ArtifactId): Promise<Artifact>;
  list(filter: { task_id?: string; type?: ArtifactType }): Promise<Artifact[]>;

  // task_status-specific operations
  read_task_status(task_id: string): Promise<TaskStatus | null>;
  // CAS append: succeeds only if the latest task_status for task_id matches `expected_phase`
  // (or null when expected_phase is null, i.e. no prior row). Used by the body's notify path.
  cas_append_task_status(
    task_id:        string,
    expected_phase: TaskPhase | null,
    next_phase:     TaskPhase,
    iteration:      number,
  ): Promise<{ ok: true; updated_at: string } | { ok: false; reason: 'phase_changed' }>;
}
```

The interface is the only dependency visible to `core` and `agents`. The backing store is injected at startup.

## Default Implementation

`SqliteArtifactStore` in `packages/storage/`. Local file, no external service required. Writes are serialized by SQLite; the store is the single source of truth for artifact bytes and for task status. The store generates ULIDs as primary keys for artifact rows — timestamp-prefixed, sortable, 26-character strings (`01ARZ3NDEKTSV4RRFFQ69G5FAV`). The `id` column in the `artifacts` table is TEXT, not an auto-increment integer.

`task_status` rows are stored in the same `artifacts` table as other types. The latest `task_status` per `task_id` (by `created_at`) is canonical. An index on `(task_id, type, created_at DESC)` makes `read_task_status` O(log N). `cas_append_task_status` is a single SQLite transaction that re-reads the latest row inside the transaction, validates the expected phase, and inserts the new row; conflicting writers see `phase_changed` and may retry.

## General Tools

Three general-purpose tools wrap the store:

- `read_artifact(artifact_id)` — available to any soul that needs it.
- `write_artifact(type, content)` — available to any soul that produces artifacts. The tool implementation reads `task_id` from `ExecutionContext` and stamps it on the row; the soul does not pass it explicitly. Souls do **not** call `write_artifact` for `type: 'task_status'`; status transitions are written exclusively by the body inside the `notify` flow.
- `read_task_status(task_id)` — available to all roles. Returns the current `TaskStatus` for the given `task_id`, or `null` if no status row has been written. Used by the DM to gate per-task entry decisions and by other roles to inspect their own task's phase.

Artifacts are never passed in event payloads. Events carry only `artifact_id`. `task_status` rows are an internal record; events do not carry `task_status` ids.

## Sessions vs Tasks

- A **task** has a stable, durable `task_id` (e.g. `PROJ-123`, `gh-issue-42`, or a DM-generated `prompt-{hash8}` for ad-hoc prompts).
- A **session** is one workflow run for a task. A `task_id` whose previous session ended in `task.failed` may be re-entered in a later session — for example, an implementer failure can be retried as a fresh session under the same `task_id`. All sessions for a task accumulate artifacts under the same `task_id`. A `task_id` whose previous session ended in `task.done` is permanent and cannot be re-entered (a follow-up needs a new `task_id`); see `08-role-definitions.md`.
- Re-entry of free-form prompt tasks (`prompt-*`) is not supported in v1; the user would need to repeat the prompt. JIRA/GH-keyed tasks re-enter naturally on `failed`.

## Retention

v1 keeps all rows indefinitely — both artifact rows (`task`, `research`, `plan`, `review`) and `task_status` rows. No deletion or compaction runs in v1. The append-only `task_status` chain for a completed task accumulates up to ~9 rows per session per `task_id`; this is negligible at development-team scale.

GC, archival, and compaction policy (including collapsing `task_status` chains to one row per terminal task and pruning intermediate artifacts for `done` tasks) is deferred to the **Storage Maintenance** chapter (TBD; see open item #7).

## Out of Scope (intentionally removed)

- `descriptor_patch` artifacts — Architect output is `CONTEXT.md` files; their history is owned by `git`. The `task.designed` event payload references the descriptor file paths touched, not an artifact id. (Event-system payload schema updated accordingly.)
- `file_snapshot` artifacts — implementation file history is owned by `git`. Agents do not snapshot files into a parallel store.
