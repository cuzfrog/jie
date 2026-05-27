# Agent Lifecycle

All agent processes are long-lived. They start with the team and remain subscribed to the bus indefinitely.

## Pipeline Seriality

Each role subscribes to the event the previous role emits, so under normal operation only one agent is processing at a time per task. There is no team-wide distributed latch; pipeline structure provides serialization.

The DM enforces a **single-task-in-flight** invariant: it does not emit `task.recorded` for a new task while a previous task is still in flight. A task is in flight from `task.recorded` until the DM emits `task.done` (after a `task.review_passed` finalization) or `task.failed`. Additional user prompts queue in the DM's local FIFO until the active task terminates. A task that has reached `failed` may be re-entered (the DM emits `task.recorded` again for the same `task_id`); a task that has reached `done` is permanent. See `08-role-definitions.md` for details.

Multi-task coordination policy (parallelism, priorities, preemption, sub-teams) is deferred to a dedicated chapter (TBD).

## Session Flow (single iteration)

```
[user prompt arrives at DM]

DM
  → may pull additional context via MCP tools
  → mints a new session_id
  → writes the task artifact (iteration = 1)
  → publishes session.{id}.task.recorded   { task_artifact_id }

Researcher reacts to task.recorded
  → reads task artifact, web searches, reads project documentation via read_module_doc
  → writes research artifact (iteration = 1)
  → publishes session.{id}.task.researched   { research_artifact_id }

Architect reacts to task.researched
  → reads research artifact
  → queries code-lens for current structure
  → updates CONTEXT.md via write_module_descriptor
  → publishes session.{id}.task.designed   { descriptor_paths }

Planner reacts to task.designed
  → reads task + research artifacts, reads updated descriptors
  → writes plan artifact (iteration = 1)
  → publishes session.{id}.task.planned   { plan_artifact_id }

Implementer reacts to task.planned
  → reads plan artifact and module descriptors
  → write_file (boundary-enforced), run_tests
  → publishes session.{id}.task.implemented   { result_artifact_ids }
    (or session.{id}.task.failed on hard violation)

Reviewer reacts to task.implemented
  → reads plan + result artifacts, may run tests, may inspect files
  → writes review artifact (iteration = N)
  → publishes:
       session.{id}.task.review_passed   { review_artifact_id }
     OR
       session.{id}.task.review_failed   { review_artifact_id }

DM reacts to task.review_passed
  → reads result artifacts
  → finalizes externally (e.g. closes the JIRA issue, posts a summary)
  → synthesizes and surfaces result to user
  → publishes session.{id}.task.done   { review_artifact_id }

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
  → publishes session.{id}.task.planned (iteration = N+1)
```

The pipeline re-enters at Implementer → Reviewer for the new iteration. Loop continues until either:

- Reviewer publishes `task.review_passed` → DM finalizes.
- `iteration` reaches `max_iterations` (default 5, configurable per task). The next agent that observes the cap exhaustion (typically the planner when about to start iteration N+1) emits `task.failed` instead. DM finalizes failure.

## Iteration Ownership

`iteration` is initialized to **1** by the DM in `task.recorded`. Every other role's body **copies** `iteration` from the inbound event into the outbound event unchanged. The **planner** is the only role permitted to increment it, and only when reacting to `task.review_failed` (the new plan is emitted with `iteration + 1`).

## Iteration in Events

Every event in the envelope carries `iteration: number`. Subscribers know their iteration without opening artifacts.

## Failure

`task.failed` is emitted by:

- An agent whose `error_turn_budget` or `total_turn_budget` is exhausted on the current event.
- The implementer when hitting a hard module-boundary block it cannot reason its way around.
- The planner when iteration cap is reached.
- The DM if external finalization on `task.review_passed` fails irrecoverably (with `phase: 'dm'`).

`task.failed` is terminal in the task-status sense (the in-flight slot frees), but the same `task_id` may be re-entered later by a fresh DM `task.recorded`. DM observes `task.failed` and surfaces failure to the user; it does not emit any follow-up event.

`task.done` is emitted only by the DM, on successful finalization of a `task.review_passed`. It is the canonical "task fully complete" signal for external observers (TUI, audit log). No agent role subscribes to it.

## Compaction

Compaction is an internal Memory-subsystem operation; it is not published on the event bus. Triggers, signals, and behavior are specified in the Memory chapter (TBD).
