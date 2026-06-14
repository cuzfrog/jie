# Agent Lifecycle

All agents are long-lived. They start with the team and remain subscribed to the bus indefinitely.

## Pipeline Seriality

Each role subscribes to the topic the previous role publishes to, so under normal operation only one agent is processing at a time per task. There is no team-wide distributed latch; pipeline structure provides serialization.

The DM enforces a **single-task-in-flight** invariant: it does not emit `task.recorded` for a new task while a previous task is still in flight. A task is in flight from `task.recorded` until the DM emits `task.done` or `task.failed`. Additional user prompts queue in the DM's local FIFO until the active task terminates.

## Workflow (single iteration)

```
[user prompt arrives at DM on leader.prompt]

DM
  → may pull additional context via MCP tools
  → writes the task artifact (iteration = 1)
  → notify('task.recorded', '...')

Researcher receives task.recorded
  → reads task artifact, web searches, reads project documentation via read_module_doc
  → writes research artifact (iteration = 1)
  → notify('task.researched', '...')

Architect receives task.researched
  → reads research artifact
  → queries code-lens for current structure
  → updates CONTEXT.md via write_module_contract
  → notify('task.designed', '...')

Planner receives task.designed
  → reads task + research artifacts, reads updated descriptors
  → writes plan artifact (iteration = 1)
  → notify('task.planned', '...')

Implementer receives task.planned
  → reads plan artifact and module descriptors
  → write_file (boundary-enforced), bash (run tests, linters, build tools)
  → notify('task.implemented', '...')
    (or notify('task.failed', '...') on hard violation)

Reviewer receives task.implemented
  → reads plan + result artifacts, inspects diffs
  → writes review artifact (iteration = N)
  → notify('task.review_passed', '...')
    OR
    notify('task.review_failed', '...')

DM receives task.review_passed
  → reads result artifacts
  → finalizes externally (e.g. closes the JIRA issue, posts a summary)
  → synthesizes and surfaces result to user
  → notify('task.done', '...')

DM receives task.failed
  → reads available artifacts
  → surfaces failure to user (no follow-up event)
```

## Iteration Loop

If the reviewer publishes `task.review_failed`:

```
Planner receives task.review_failed
  → reads the review artifact + previous plan + accumulated artifacts for this task
  → iteration++
  → writes new plan artifact at iteration N+1
  → notify('task.planned', '...')
```

The pipeline re-enters at Implementer → Reviewer for the new iteration. Loop continues until either:

- Reviewer publishes `task.review_passed` → DM finalizes.
- `iteration` reaches `max_iterations` (default 5). The next agent that observes the cap exhaustion (typically the planner when about to start iteration N+1) emits `task.failed` instead.

## Iteration Ownership

`iteration` lives in the payload of the planner→implementer→reviewer events. The **planner** initializes it to **1** in its first `task.planned` and is the only role permitted to increment it. The implementer and reviewer track the planner's iteration in their own responses. Roles outside the reviewed loop (`task.recorded`, `task.researched`, `task.designed`, `task.done`, `task.failed`) do not carry iteration.

## Failure

`task.failed` is emitted by:

- An agent that encounters an unrecoverable error during the current event (e.g., repeated tool failures, internal exception).
- The implementer when hitting a hard module-boundary block it cannot reason its way around.
- The planner when iteration cap is reached.
- The DM if external finalization on `task.review_passed` fails irrecoverably.

`task.failed` is terminal in the task-status sense (the in-flight slot frees), but the same `task_id` may be re-entered later by a fresh DM `task.recorded`.

`task.done` is emitted only by the DM, on successful finalization of a `task.review_passed`. It is the canonical "task fully complete" signal.
