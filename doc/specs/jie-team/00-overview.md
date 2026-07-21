# Jie Team — Overview

**Status: aspirational — the package has no code yet. The only shipped team is the built-in minimal team (`packages/jie-platform/team/minimal/`).**

## Purpose

jie-team is a team-blueprint framework on top of `jie-platform`, plus a built-in software-development team blueprint. The platform provides the agent model, event bus, artifact store, memory, and deployment; the team blueprint adds roles, domain event topics, the task lifecycle, and the workflow.

## The dev-team blueprint

Six roles form a serial pipeline on `task` work units: Delivery Manager (DM, the leader) → Researcher → Architect → Planner → Implementer → Reviewer → DM. Each role subscribes to the topic the previous role publishes, so the pipeline structure itself serializes work; there is no central router and no agent knows another by identity.

- DM — sole external entry point. Receives user prompts via the platform's `user.prompt` topic (addressed to its `agentKey`), gathers full task content via its MCP tools (GitHub, JIRA), writes the `task` artifact, and emits `task.recorded`; if it cannot produce the artifact it emits `task.rejected` instead. Enforces single-task-in-flight: extra prompts queue in its local FIFO until the active task terminates. On `task.review_passed` it finalizes externally and emits `task.done`; on `task.failed` it reports to the user with no follow-up event. Has no file-system tools.
- Researcher — on `task.recorded`, gathers external context and project documentation; presents facts in the `research` artifact and does not decide. Has no access to source files or contracts. Mandatory for all tasks in v1.
- Architect — on `task.researched`, the sole role that authors module contracts and inspects codebase structure beyond descriptors (via code-lens); updates `CONTEXT.md` files and emits `task.designed`.
- Planner — decides how to implement given research and contracts. Sole role that sets `iteration`: 1 on `task.designed`, incremented on `task.review_failed` kickback.
- Implementer — follows the plan and module descriptors (`write_file`, `bash`); emits `task.implemented`, or `task.failed` on a hard boundary violation it cannot reason around.
- Reviewer — evaluates output against the plan and contracts, always writes a `review` artifact, emits `task.review_passed` or `task.review_failed`. Cannot modify code.

### Iteration loop

On `task.review_failed` the Reviewer kicks back to the Planner, and the Planner → Implementer → Reviewer segment re-runs at `iteration` N+1. The loop is bounded by `max_iterations` (a team-level setting, default 5; per-task overrides deferred); when the cap is exhausted the Planner emits `task.failed` instead of planning again. `task.review_passed` ends the pipeline: the DM finalizes and emits `task.done`, the only permanent phase.

## Task model

A task has a durable `task_id` (e.g. `PROJ-123`, `gh-issue-42`, or a DM-minted `prompt-{hash8}`) and can span multiple iterations and sessions; artifacts accumulate under keys like `{task_id}/plan`. The artifact store is KV (`INSERT OR REPLACE`), so task progression is recorded under sequenced keys; the latest status row per `task_id` (by `created_at`) is the canonical current state: phase, iteration, updated_at. The body validates each transition on every `notify` and returns an `illegal_transition` tool error instead of publishing when it is not allowed.

Phases: `recorded → researched → designed → planned → implemented → review_passed | review_failed → done | failed`. Only `done` is permanent and non-re-enterable; the DM may re-record a `task_id` in any other phase, starting a fresh session at `iteration = 1`. `task.rejected` is a pre-record failure signal with no status row and no `rejected` phase. Allowed transitions, gated per role:

| From phase | Role | To phase |
|---|---|---|
| none, or any non-done | DM | recorded |
| recorded | Researcher | researched |
| researched | Architect | designed |
| designed | Planner | planned |
| review_failed | Planner | planned (iteration++) |
| planned | Implementer | implemented |
| implemented | Reviewer | review_passed / review_failed |
| review_passed | DM | done |
| any non-terminal | any role | failed (DM only on finalization failure) |

Team artifact types: `task` (DM, sole writer), `research` (Researcher), `plan` (Planner), `review` (Reviewer).

## Module descriptor and the sealed boundary

Each source directory may hold a `CONTEXT.md` owned by the Architect: YAML frontmatter (the module contract — machine-readable exported signatures per file) plus markdown prose (the architectural narrative). Only the Architect's `write_module_contract` / `write_module_doc` tools mutate it; other roles read via `read_module_contract` / `read_module_doc`, and user hand-edits win over concurrent architect writes. A descriptor governs only its immediate directory — no inheritance into subdirectories. The boundary rule is **no-new-exports**: agents cannot change a module's public signatures except via an Architect-authored contract update, and a directory without a descriptor defaults to no-new-exports, never implicitly opened. Signature text is opaque and language-defined, produced by code-lens language adapters; the `write_file` gate algorithm and failure reporting are deferred.

## Event topics

From the blueprint's view, agents coordinate on unscoped topic names — `user.prompt` (platform-managed user ingress, addressed to the DM's `agentKey`) plus the domain topics `task.recorded`, `task.rejected`, `task.researched`, `task.designed`, `task.planned`, `task.implemented`, `task.review_passed`, `task.review_failed`, `task.done`, `task.failed`. Subscription graph:

```
DM:          user.prompt (platform-managed, filtered on agentKey), task.review_passed, task.failed
Researcher:  task.recorded
Architect:   task.researched
Planner:     task.designed, task.review_failed
Implementer: task.planned
Reviewer:    task.implemented
```

The platform's actual wire model — `custom.${teamId}.` prefixed domain topics, typed event envelopes, `user.prompt` ingress addressed by `agentKey` — is defined in `jie-platform/03-event-system.md`; the names above are the team-level view of it, not a second wire format.

## v1 scope boundaries

Strictly one task in flight per team (no DM parallelism, priorities, or sub-teams); the only ingress is a direct user prompt via `user.prompt` (no GitHub/JIRA/cron/webhook triggers); every task runs the full pipeline (no trivial-task fast-path); every role has exactly one instance; `max_iterations` applies uniformly to all tasks.

## Glossary (team-specific terms only)

Platform terms (Agent, Soul, Body, EventBus, Topic, Tool, `notify`, Artifact, Leader Agent, Team Blueprint, ...) are defined in `jie-platform/00-overview.md`.

| Term | Definition |
|---|---|
| **Task** | A unit of work with a durable `task_id`. Can span multiple iterations and sessions; artifacts accumulate under it. |
| **Iteration** | One pass through the Planner → Implementer → Reviewer loop within a task. Starts at 1; the Planner is the sole role that increments it. Bounded by `max_iterations` (default 5). |
| **Module Descriptor** | A `CONTEXT.md` file in a source directory: YAML contract frontmatter + markdown prose. Owned by the Architect; governs only its immediate directory. |
| **Module Contract** | The YAML frontmatter of a Module Descriptor: exported symbol names and opaque canonical signatures per file. |
| **Workflow** | The serial pipeline DM → Researcher → Architect → Planner → Implementer → Reviewer → DM, with the iteration loop between Planner, Implementer, and Reviewer. |
