# Role Definitions

Built-in roles. Their `tools`, `subscriptions`, `publishes`, and the structured parts of the system prompt are fixed in `core`. Agent `.md` files only override `model` / `error_turn_budget` / `total_turn_budget` and supply prose.

`tools` entries follow the notation defined in `07-agent-model.md`:
- `read_file` — built-in
- `mcp:<server>:<method>` — specific MCP method
- `mcp:<server>:<glob>` — globbed MCP tools (anchored shell-style; `*` and `?` only)

The built-in `notify` tool is registered automatically on every role and is omitted from the per-role `tools` lists below. A role's `publishes` list is the set of `event_type` values its `notify` will accept; the body rejects any other value with `not_in_publishes`. The built-in `read_task_status` tool is also registered automatically on every role; it allows any soul to inspect the current `task_status` record for a given `task_id`.

## Allowed Transition Table

The body's task-status guard enforces these transitions on every `notify` call:

| From phase | Role | To phase |
|---|---|---|
| *(no entry)* | dm | recorded |
| failed | dm | recorded |
| recorded | researcher | researched |
| researched | architect | designed |
| designed | planner | planned |
| review_failed | planner | planned (iteration++) |
| planned | implementer | implemented |
| implemented | reviewer | review_passed |
| implemented | reviewer | review_failed |
| review_passed | dm | done |
| any non-terminal | any non-DM role | failed |

Terminal phases for the in-flight gate are `done` and `failed`. `done` is permanent for that `task_id` — no transition out of `done` is legal. `failed` is the only terminal phase the DM can re-enter from: it may emit `task.recorded` again, starting a fresh session at `iteration = 1`. Artifacts accumulate under the same `task_id` across sessions.

`review_passed` is a pipeline phase, not a task-status terminal. The DM subscribes to `task.review_passed`, performs external-ticket finalization (closing the JIRA issue, posting back, etc.), and then calls `notify('task.done', { review_artifact_id })`. The body's CAS advances `review_passed → done`. If finalization fails irrecoverably, the DM may instead emit `task.failed` (per the "any non-terminal → failed" row, the DM is included for this case alone).

`task.rejected` is a special event with **no task-status mutation**. It is a pre-record signal published by the DM when no task artifact can be produced. The body publishes the event but performs no CAS, and no `task_status` row is created or updated. There is no `rejected` phase. The next prompt with the same `task_id` (if any) is a fresh `(no entry) → recorded` transition.

## DM (Delivery Manager)

```
subscriptions: ['team.{team_id}.prompt', 'task.review_passed', 'task.failed']
publishes:     ['task.recorded', 'task.rejected', 'task.done', 'task.failed']
tools:
  - write_artifact
  - read_artifact
  - read_task_status       // built-in; also auto-registered on all roles
  - mcp:github:*           // entire GitHub MCP server, auto-discovered at startup
  - mcp:jira:*             // entire JIRA MCP server, auto-discovered at startup
```

The DM is the only agent with an external-facing entry point. The sole v1 trigger is a user prompt arriving on NATS subject `team.{team_id}.prompt`, published by the TUI or a headless CLI. The DM's prompt subscription is the first entry in its `subscriptions` list above. (Backlog/cron/webhook integration is deferred.)

### Single-Task-In-Flight Invariant

The DM accepts only one in-flight task at a time per team. The invariant is enforced by the DM's own reasoning, backed by `read_task_status` and the body's per-task compare-and-append guard:

- On prompt arrival, the DM calls `read_task_status(task_id)` to check whether this specific `task_id` is in a non-terminal phase (anything other than `done` or `failed`). If so, the DM queues the prompt (in memory) and defers.
- Across distinct `task_id`s, the DM relies on its working memory (managed by the Memory subsystem, TBD) to know whether a different task is currently in flight. There is no team-wide lock; the Memory module is responsible for restart-recovery of this context.
- `task.rejected` is pre-record and writes no `task_status` row; it does not occupy the in-flight slot.
- On observing `task.review_passed`, the DM finalizes (external ticket update, user-facing summary) and emits `task.done`. The slot frees on `done`.
- On observing `task.failed`, the slot frees immediately. The DM then dequeues the next pending prompt.
- Re-entry: a task in phase `failed` may be re-recorded by the DM. A task in phase `done` is permanent and cannot be re-entered under the same `task_id`.

Multi-task coordination policy (parallelism, priorities, preemption, sub-teams) is deferred to a dedicated chapter (TBD).

### On Trigger

1. The DM receives a prompt on `team.{team_id}.prompt`. Payload: `{ prompt: string, task_id?: string }`. The `task_id` field, if present, is a user-supplied identifier; if absent, the DM derives one (see On Pre-Record Failure).
2. The DM uses its tools to gather full task content (e.g., fetches the referenced issue via JIRA MCP if a ticket key is detected, or accepts the prompt body directly).
3. The DM mints a new `session_id` and writes the canonical `task` artifact via `write_artifact`. **The DM is the sole writer of `task` artifacts.**
4. The DM calls `notify('task.recorded', { task_artifact_id })` with `iteration = 1`. The body's task-status guard runs the compare-and-append (legal from `(no entry)` or from `failed`) and the event is published on `session.{session_id}.task.recorded`.

### On Pre-Record Failure

If the DM cannot produce a task artifact at all — e.g. the JIRA fetch fails, the user prompt is empty/malformed, no `task_id` can be derived — it does **not** emit `task.recorded` and does **not** emit `task.failed`. Instead:

1. The DM mints a `session_id` (so the rejection is addressable on the bus).
2. The DM derives a `task_id`: the user-supplied id if available, otherwise a synthetic `prompt-{hash8}` over the raw input (or `unparseable-{hash8}` if even that fails).
3. The DM calls `notify('task.rejected', { reason })` with a short, user-facing reason string.
4. The body publishes `session.{session_id}.task.rejected` and performs no compare-and-append — no `task_status` row is created. There is no `rejected` phase.

`task.rejected` carries no pipeline. The DM dequeues the next pending prompt as it would on any terminal-equivalent event. Failures encountered *after* `task.recorded` has been published — e.g. transient errors during finalization on a later `task.review_passed` — are handled per "On Terminal Event" below: irrecoverable finalization failure produces `task.failed`, transient failures are logged and retried by the DM.

### On Terminal Event

On `task.review_passed`, the DM:

- Reads the iteration's artifacts.
- Synthesizes a user-facing result.
- If the task originated from an external issue (JIRA or GitHub), posts a comment summarizing the result and closes/transitions the issue. The DM's system prompt instructs it to detect external origins and use its MCP tools (`mcp:jira:*`, `mcp:github:*`) to perform this finalization.
- Calls `notify('task.done', { review_artifact_id })`. The body appends a `task_status` row advancing phase from `review_passed` to `done` and publishes `task.done`. The in-flight slot frees on `done`.
- If finalization fails irrecoverably, the DM calls `notify('task.failed', { error, phase: 'dm' })` instead. The slot frees on `failed`; the task may be re-entered later.

On `task.failed`, the DM:

- Reads available artifacts.
- Synthesizes a user-facing failure summary (logged and surfaced in the TUI; no external ticket update).
- Does **not** emit a follow-up event. The slot is already free.

In both cases, the DM dequeues the next pending prompt, if any.

The DM has no file system tools and no knowledge of the codebase.

## Researcher

```
subscriptions: ['task.recorded']
publishes:     ['task.researched']
tools:
  - web_search
  - read_artifact
  - read_module_doc
  - write_artifact
```

Gathers external context (web, prior artifacts) and project documentation (module prose). Presents facts and required information in the `research` artifact; **does not decide**. Has no access to source files, descriptors (contracts), or code-lens. Calls `notify('task.researched', { research_artifact_id })` to terminate.

## Architect

```
subscriptions: ['task.researched']
publishes:     ['task.designed']
tools:
  - read_module_descriptor
  - read_module_doc
  - write_module_descriptor                  // sole writer of module contracts
  - write_module_doc                         // sole writer of module prose
  - read_artifact
  - mcp:code-lens:get_module_exports
  - mcp:code-lens:get_import_graph
```

Sole role authorized to author module contracts and to inspect codebase structure beyond descriptors (via code-lens). Reads the research artifact, queries code-lens for current structure, updates `CONTEXT.md` files (both frontmatter and prose) via the write tools. Calls `notify('task.designed', { descriptor_paths })` listing the descriptor file paths touched.

## Planner

```
subscriptions: ['task.designed', 'task.review_failed']
publishes:     ['task.planned', 'task.failed']
tools:
  - read_artifact
  - read_module_descriptor
  - read_module_doc
  - write_artifact
```

Sole role that decides *how* to implement, given the research artifact and module contracts.

On `task.designed` (iteration 1) writes a `plan` artifact. On `task.review_failed` reads the failed `review` artifact, increments `iteration`, writes a revised `plan` artifact at the new iteration. Calls `notify('task.planned', { plan_artifact_id })` in both cases — with the inbound iteration on `task.designed`, and with `iteration + 1` on `task.review_failed`. The planner is the only role permitted to change `iteration`.

If the planner detects `iteration > max_iterations` for the task, it writes a brief explanation artifact and calls `notify('task.failed', { error, phase: 'planner' })` instead.

## Implementer

```
subscriptions: ['task.planned']
publishes:     ['task.implemented', 'task.failed']
tools:
  - read_file
  - write_file                // module-boundary-enforced
  - read_artifact
  - read_module_descriptor
  - run_tests
```

Follows the plan and module descriptors. Calls `notify('task.implemented', { result_artifact_ids })` on success or `notify('task.failed', { error, phase: 'implementer' })` on a hard violation (e.g. boundary block, fatal test runner error). Soft test failures are part of the implementer's reasoning loop, not a final-state failure.

## Reviewer

```
subscriptions: ['task.implemented']
publishes:     ['task.review_passed', 'task.review_failed']
tools:
  - read_file
  - read_artifact
  - read_module_descriptor
  - run_tests
  - write_artifact            // writes review artifact
```

Evaluates the implementer's output against the plan and module contracts. Writes a `review` artifact (always, regardless of outcome). Calls `notify('task.review_passed', { review_artifact_id })` or `notify('task.review_failed', { review_artifact_id })` based on its own verdict. The reviewer cannot write or modify code.
