# Agent Lifecycle

All agent processes are long-lived. They start with the team and remain subscribed to the bus indefinitely.

## Pipeline Seriality

Each role subscribes to the event the previous role emits, so under normal operation only one agent is processing at a time per task. There is no team-wide distributed latch; pipeline structure provides serialization.

The DM enforces a **single-task-in-flight** invariant: it does not emit `task.recorded` for a new task while a previous task is still in flight. A task is in flight from `task.recorded` until the DM emits `task.done` or `task.failed`. Additional user prompts queue in the DM's local FIFO until the active task terminates.

## Session Flow (single iteration)

```
[user prompt arrives at DM]

DM
  → may pull additional context via MCP tools
  → mints a new session_id
  → writes the task artifact (iteration = 1)
  → publishes session.{id}.task.recorded   { task_id, task_artifact_id }

Researcher reacts to task.recorded
  → reads task artifact, web searches, reads project documentation via read_module_doc
  → writes research artifact (iteration = 1)
  → publishes session.{id}.task.researched   { task_id, research_artifact_id }

Architect reacts to task.researched
  → reads research artifact
  → queries code-lens for current structure
  → updates CONTEXT.md via write_module_contract
  → publishes session.{id}.task.designed   { task_id, descriptor_paths }

Planner reacts to task.designed
  → reads task + research artifacts, reads updated descriptors
  → writes plan artifact (iteration = 1)
  → publishes session.{id}.task.planned   { task_id, iteration: 1, plan_artifact_id }

Implementer reacts to task.planned
  → reads plan artifact and module descriptors
  → write_file (boundary-enforced), bash (run tests, linters, build tools)
  → publishes session.{id}.task.implemented   { task_id, iteration: 1, result_artifact_ids }
    (or session.{id}.task.failed on hard violation)

Reviewer reacts to task.implemented
  → reads plan + result artifacts, inspects diffs
  → writes review artifact (iteration = N)
  → publishes:
       session.{id}.task.review_passed   { task_id, iteration: N, review_artifact_id }
    OR
       session.{id}.task.review_failed   { task_id, iteration: N, review_artifact_id }

DM reacts to task.review_passed
  → reads result artifacts
  → finalizes externally (e.g. closes the JIRA issue, posts a summary)
  → synthesizes and surfaces result to user
  → publishes session.{id}.task.done   { task_id, review_artifact_id }

DM reacts to task.failed
  → reads available artifacts
  → surfaces failure to user (no follow-up event)
```

## Iteration Loop

If the reviewer publishes `task.review_failed`:

```
Planner reacts to task.review_failed
  → reads the review artifact + previous plan + accumulated artifacts for this task
  → iteration++
  → writes new plan artifact at iteration N+1
  → publishes session.{id}.task.planned { task_id, iteration: N+1, plan_artifact_id }
```

The pipeline re-enters at Implementer → Reviewer for the new iteration. Loop continues until either:

- Reviewer publishes `task.review_passed` → DM finalizes.
- `iteration` reaches `max_iterations` (default 5). The next agent that observes the cap exhaustion (typically the planner when about to start iteration N+1) emits `task.failed` instead.

## Iteration Ownership

`iteration` lives in the payload of the planner→implementer→reviewer events (`task.planned`, `task.implemented`, `task.review_passed`, `task.review_failed`). The **planner** initializes it to **1** in its first `task.planned` and is the only role permitted to increment it. The implementer and reviewer copy the planner's iteration into their own payloads unchanged. Roles outside the reviewed loop (`task.recorded`, `task.researched`, `task.designed`, `task.done`, `task.failed`) do not carry iteration.

## Failure

`task.failed` is emitted by:

- An agent whose `error_turn_budget` or `total_turn_budget` is exhausted on the current event.
- The implementer when hitting a hard module-boundary block it cannot reason its way around.
- The planner when iteration cap is reached.
- The DM if external finalization on `task.review_passed` fails irrecoverably.

`task.failed` is terminal in the task-status sense (the in-flight slot frees), but the same `task_id` may be re-entered later by a fresh DM `task.recorded`.

`task.done` is emitted only by the DM, on successful finalization of a `task.review_passed`. It is the canonical "task fully complete" signal.
