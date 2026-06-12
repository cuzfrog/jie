# Role Definitions

Built-in roles for the default software development team blueprint. The platform provides the agent model — the team blueprint defines what roles exist, what topics they listen to, and what tools they have.

`tools` entries follow the notation defined in `jie-platform/06-agent-model.md`:
- `tool_name` — built-in tool (resolved against platform tool registry)
- `mcp:<server>:<method>` — specific MCP method
- `mcp:<server>:<glob>` — globbed MCP tools (anchored shell-style; `*` and `?` only)

The built-in `notify` tool is registered automatically on every role and is omitted from the per-role `tools` lists below. Agents use `notify(topic, prompt)` for all inter-agent communication.

## DM (Delivery Manager)

Team leader. Sole external-facing entry point. Enforces single-task-in-flight invariant. Auto-subscribes to `leader.prompt` (user ingress) via platform auto-wiring.

```
subscribe:
  - task.review_passed
  - task.failed
tools:
  - write_artifact
  - read_artifact
  - mcp:github:*
  - mcp:jira:*
```

The DM is the only agent with the platform auto-subscription to `leader.prompt`. The sole v1 trigger is a user prompt arriving on `leader.prompt`.

### Single-Task-In-Flight Invariant

The DM accepts only one in-flight task at a time per team. The invariant is enforced by the DM's own reasoning:

- On prompt arrival, the DM checks whether a task is currently in flight by reading the latest status via `read_artifact('current/status')` or consulting its working memory.
- The DM relies on its working memory (managed by the Memory subsystem) to know whether a task is in flight.
- `task.rejected` is pre-record and does not occupy the in-flight slot.
- On receiving `task.review_passed` (via its subscription), the DM finalizes (external ticket update, user-facing summary) and calls `notify('task.done', '...')`. The slot frees on `done`.
- On receiving `task.failed` (via its subscription), the slot frees immediately. The DM then dequeues the next pending prompt.
- Re-entry: a task in phase `failed` may be re-recorded by the DM. A task in phase `done` is permanent and cannot be re-entered.

### On Trigger

1. The DM receives `{ prompt: string }` on `leader.prompt` (see `jie-platform/03-event-system.md`).
2. The DM uses its tools to gather full task content.
3. The DM writes the canonical `task` artifact via `write_artifact(key, content)` using a key derived from the task identifier (e.g. `{task_id}/task`).
4. The DM calls `notify('task.recorded', 'new task {task_id} with artifact {artifact_id}')`.

### On Pre-Record Failure

If the DM cannot produce a task artifact — e.g. the JIRA fetch fails, the user prompt is empty — it does **not** emit `task.recorded`:

1. The DM derives a `task_id`.
2. The DM calls `notify('task.rejected', 'cannot record task {task_id}: {reason}')`.
3. The body publishes `task.rejected` and does not write a `task_status` row.

`task.rejected` carries no pipeline. The DM dequeues the next pending prompt.

### On Terminal Event

On receiving `task.review_passed`, the DM:
- Reads the iteration's artifacts.
- Synthesizes a user-facing result.
- If the task originated from an external issue, posts a comment and closes/transitions the issue.
- Calls `notify('task.done', 'task {task_id} completed with review {review_artifact_id}')`.
- If finalization fails irrecoverably, calls `notify('task.failed', 'finalization failed for {task_id}: {error}')` instead.

On receiving `task.failed`, the DM:
- Reads available artifacts.
- Synthesizes a user-facing failure summary.
- Does **not** emit a follow-up event. The slot is already free.

The DM has no file system tools and no knowledge of the codebase.

## Researcher

```
subscribe:
  - task.recorded
tools:
  - web_search
  - web_fetch
  - read_artifact
  - read_module_doc
  - write_artifact
```

Gathers external context and project documentation. Presents facts in the `research` artifact; **does not decide**. Has no access to source files, descriptors (contracts), or code-lens. Calls `notify('task.researched', 'research completed for {task_id}: {research_artifact_id}')` to signal completion.

The researcher is **mandatory for all tasks in v1**. No skip path exists. Trivial-task fast-path handling is deferred.

## Architect

```
subscribe:
  - task.researched
tools:
  - read_module_contract
  - read_module_doc
  - write_module_contract
  - write_module_doc
  - read_artifact
  - mcp:code-lens:get_module_exports
  - mcp:code-lens:get_import_graph
```

Sole role authorized to author module contracts and to inspect codebase structure beyond descriptors (via code-lens). Reads the research artifact, queries code-lens for current structure, updates `CONTEXT.md` files. Calls `notify('task.designed', 'design complete for {task_id}: descriptors at {paths}')`.

## Planner

```
subscribe:
  - task.designed
  - task.review_failed
tools:
  - read_artifact
  - read_module_contract
  - read_module_doc
  - write_artifact
```

Sole role that decides *how* to implement, given the research artifact and module contracts.

On `task.designed` (iteration 1) writes a `plan` artifact. On `task.review_failed` reads the failed `review` artifact, increments `iteration`, writes a revised `plan` artifact at the new iteration. The planner is the only role permitted to change `iteration`.

If the planner detects `iteration > max_iterations` for the task, it writes a brief explanation artifact and calls `notify('task.failed', 'iteration cap reached for {task_id} at iteration {iteration}')` instead.

## Implementer

```
subscribe:
  - task.planned
tools:
  - read_file
  - write_file
  - read_artifact
  - read_module_contract
  - bash
```

Follows the plan and module descriptors. Calls `notify('task.implemented', 'implementation complete for {task_id} iteration {iteration}: {result_artifact_ids}')` on success or `notify('task.failed', 'implementation failed for {task_id}: {error}')` on a hard violation.

## Reviewer

```
subscribe:
  - task.implemented
tools:
  - read_file
  - read_artifact
  - read_module_contract
  - write_artifact
```

Evaluates the implementer's output against the plan and module contracts. Writes a `review` artifact (always, regardless of outcome). Calls `notify('task.review_passed', 'review passed for {task_id} iteration {iteration}: {review_artifact_id}')` or `notify('task.review_failed', 'review failed for {task_id} iteration {iteration}: {review_artifact_id}')` based on its own verdict. The reviewer cannot write or modify code.
