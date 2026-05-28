# Task Status

Per-task progress tracking for the default software development team. Builds on the platform's artifact store status tracking (`jie-platform/04-artifact-store.md`).

## Task Phase

```typescript
type TaskPhase =
  | 'recorded' | 'researched' | 'designed' | 'planned'
  | 'implemented' | 'review_passed' | 'review_failed'
  | 'done' | 'failed';
```

## Status Tracking

`task_status` rows are **append-only** in the artifact store. The latest row per `task_id` (by `created_at`) is the canonical current status. There is no separate KV substrate; the artifact store is the single source of truth.

When the LLM calls `notify`, the body:

- Reads the current status (or `null` if no prior row).
- Validates the requested transition against the Allowed Transition Table (below).
- On legal transition: appends a new `task_status` row via `append_status` and publishes the event.
- On illegal transition: the append is **not** performed and `notify` returns a tool-error (`illegal_transition`). The LLM may retry with a different `event_type`.

## Allowed Transition Table

The body's task-status guard enforces these transitions on every `notify` call:

| From phase | Role | To phase |
|---|---|---|
| *(no entry)* | dm | recorded |
| any non-done | dm | recorded |
| recorded | researcher | researched |
| researched | architect | designed |
| designed | planner | planned |
| review_failed | planner | planned (iteration++) |
| planned | implementer | implemented |
| implemented | reviewer | review_passed |
| implemented | reviewer | review_failed |
| review_passed | dm | done |
| any non-terminal | any non-DM role | failed |

The only permanent, non-re-enterable phase is `done`. The DM may emit `task.recorded` for a `task_id` in any other phase — including `planned`, `implemented`, `review_failed`, `review_passed`, `failed` — starting a fresh session at `iteration = 1`. Previous `task_status` rows and artifacts remain as historical data.

`review_passed` is a pipeline phase, not a task-status terminal. The DM subscribes to `task.review_passed`, performs external-ticket finalization, and then calls `notify('task.done', { review_artifact_id })`. The body appends `review_passed → done`. If finalization fails irrecoverably, the DM may instead emit `task.failed` (the DM is included for this case via the "any non-terminal → failed" row).

`task.rejected` is a special event with **no task-status mutation**. It is a pre-record signal published by the DM when no task artifact can be produced. The body publishes the event but does not write a `task_status` row. There is no `rejected` phase. The next prompt with the same `task_id` starts a fresh `(no entry) → recorded` transition.

## DM Re-entry

The DM can re-emit `task.recorded` for a `task_id` in any non-done phase, starting a new session at `iteration = 1`. Only `done` is permanent — once a task reaches `done` it cannot be re-entered under the same `task_id`.

## Sessions vs Tasks

- A **task** has a stable, durable `task_id` (e.g. `PROJ-123`, `gh-issue-42`, or a DM-generated `prompt-{hash8}`).
- A **session** is one workflow run for a task. A `task_id` whose previous session ended in `task.failed` may be re-entered in a later session.
- A `task_id` whose previous session ended in `task.done` is permanent and cannot be re-entered.
- Re-entry of free-form prompt tasks (`prompt-*`) is not supported in v1.

## Artifact Types

Team-defined artifact types written to the store:

| Type | Writer | Description |
|---|---|---|
| `task` | DM | The canonical task artifact. Sole writer. |
| `research` | Researcher | Research findings and context. |
| `plan` | Planner | Implementation plan for one iteration. |
| `review` | Reviewer | Review verdict and findings. |
