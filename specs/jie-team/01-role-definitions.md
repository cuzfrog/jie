# Role Definitions

Built-in roles for the default software development team blueprint. The platform provides the agent model — the team blueprint defines what roles exist, what they subscribe to, what they publish, and what tools they have.

`tools` entries follow the notation defined in `jie-platform/05-agent-model.md`:
- `tool_name` — built-in tool (resolved against platform tool registry)
- `mcp:<server>:<method>` — specific MCP method
- `mcp:<server>:<glob>` — globbed MCP tools (anchored shell-style; `*` and `?` only)

The built-in `notify` tool is registered automatically on every role and is omitted from the per-role `tools` lists below. A role's `publishes` list is the set of `event_type` values its `notify` will accept; the body rejects any other value with `not_in_publishes`. The built-in `read_task_status` tool is also registered automatically on every role.

## DM (Delivery Manager)

Team leader. Sole external-facing entry point. Enforces single-task-in-flight invariant.

```
subscriptions: ['team.{team_id}.prompt', 'task.review_passed', 'task.failed']
publishes:     ['task.recorded', 'task.rejected', 'task.done', 'task.failed']
tools:
  - write_artifact
  - read_artifact
  - read_task_status
  - mcp:github:*
  - mcp:jira:*
```

The DM is the only agent with an external-facing entry point. The sole v1 trigger is a user prompt arriving on NATS subject `team.{team_id}.prompt`.

### Single-Task-In-Flight Invariant

The DM accepts only one in-flight task at a time per team. The invariant is enforced by the DM's own reasoning:

- On prompt arrival, the DM calls `read_task_status(task_id)` to check whether this specific `task_id` is in a non-terminal phase (anything other than `done` or `failed`). If so, the DM queues the prompt (in memory) and defers.
- Across distinct `task_id`s, the DM relies on its working memory (managed by the Memory subsystem) to know whether a different task is currently in flight.
- `task.rejected` is pre-record and writes no `task_status` row; it does not occupy the in-flight slot.
- On observing `task.review_passed`, the DM finalizes (external ticket update, user-facing summary) and emits `task.done`. The slot frees on `done`.
- On observing `task.failed`, the slot frees immediately. The DM then dequeues the next pending prompt.
- Re-entry: a task in phase `failed` may be re-recorded by the DM. A task in phase `done` is permanent and cannot be re-entered.

### On Trigger

1. The DM receives a prompt on `team.{team_id}.prompt`. Payload: `{ prompt: string, task_id?: string }`.
2. The DM uses its tools to gather full task content.
3. The DM mints a new `session_id` and writes the canonical `task` artifact via `write_artifact`.
4. The DM calls `notify('task.recorded', { task_artifact_id })`.

### On Pre-Record Failure

If the DM cannot produce a task artifact — e.g. the JIRA fetch fails, the user prompt is empty — it does **not** emit `task.recorded`:

1. The DM mints a `session_id`.
2. The DM derives a `task_id`.
3. The DM calls `notify('task.rejected', { reason })`.
4. The body publishes `task.rejected` and does not write a `task_status` row.

`task.rejected` carries no pipeline. The DM dequeues the next pending prompt.

### On Terminal Event

On `task.review_passed`, the DM:
- Reads the iteration's artifacts.
- Synthesizes a user-facing result.
- If the task originated from an external issue, posts a comment and closes/transitions the issue.
- Calls `notify('task.done', { review_artifact_id })`.
- If finalization fails irrecoverably, calls `notify('task.failed', { error, phase: 'dm' })` instead.

On `task.failed`, the DM:
- Reads available artifacts.
- Synthesizes a user-facing failure summary.
- Does **not** emit a follow-up event. The slot is already free.

The DM has no file system tools and no knowledge of the codebase.

## Researcher

```
subscriptions: ['task.recorded']
publishes:     ['task.researched']
tools:
  - web_search
  - web_fetch
  - read_artifact
  - read_module_doc
  - write_artifact
```

Gathers external context and project documentation. Presents facts in the `research` artifact; **does not decide**. Has no access to source files, descriptors (contracts), or code-lens. Calls `notify('task.researched', { research_artifact_id })` to terminate.

The researcher is **mandatory for all tasks in v1**. No skip path exists. Trivial-task fast-path handling is deferred.

## Architect

```
subscriptions: ['task.researched']
publishes:     ['task.designed']
tools:
  - read_module_contract
  - read_module_doc
  - write_module_contract
  - write_module_doc
  - read_artifact
  - mcp:code-lens:get_module_exports
  - mcp:code-lens:get_import_graph
```

Sole role authorized to author module contracts and to inspect codebase structure beyond descriptors (via code-lens). Reads the research artifact, queries code-lens for current structure, updates `CONTEXT.md` files. Calls `notify('task.designed', { descriptor_paths })`.

## Planner

```
subscriptions: ['task.designed', 'task.review_failed']
publishes:     ['task.planned', 'task.failed']
tools:
  - read_artifact
  - read_module_contract
  - read_module_doc
  - write_artifact
```

Sole role that decides *how* to implement, given the research artifact and module contracts.

On `task.designed` (iteration 1) writes a `plan` artifact. On `task.review_failed` reads the failed `review` artifact, increments `iteration`, writes a revised `plan` artifact at the new iteration. The planner is the only role permitted to change `iteration`.

If the planner detects `iteration > max_iterations` for the task, it writes a brief explanation artifact and calls `notify('task.failed', { error, phase: 'planner' })` instead.

## Implementer

```
subscriptions: ['task.planned']
publishes:     ['task.implemented', 'task.failed']
tools:
  - read_file
  - write_file
  - read_artifact
  - read_module_contract
  - bash
```

Follows the plan and module descriptors. Calls `notify('task.implemented', { result_artifact_ids })` on success or `notify('task.failed', { error, phase: 'implementer' })` on a hard violation.

## Reviewer

```
subscriptions: ['task.implemented']
publishes:     ['task.review_passed', 'task.review_failed']
tools:
  - read_file
  - read_artifact
  - read_module_contract
  - write_artifact
```

Evaluates the implementer's output against the plan and module contracts. Writes a `review` artifact (always, regardless of outcome). Calls `notify('task.review_passed', { review_artifact_id })` or `notify('task.review_failed', { review_artifact_id })` based on its own verdict. The reviewer cannot write or modify code.
