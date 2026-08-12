# Jie Team - Overview

`jie-team` is a team-blueprint framework on top of `jie-platform`, plus a built-in software-development team blueprint. The platform provides the agent model, event bus, artifact store, memory, and deployment; the team blueprint adds roles, domain event topics, and the workflow. The `default-dev-team` blueprint is passive content — no `index.ts`, no install hook, no runtime surface (ADR 11); capability limits are declared as tool specs in each role's `tools:` list and enforced generically by the platform (ADR 37). It is shipped bundled inside `@cuzfrog/jie` (ADR 36) and made available to first-run auto-install; third-party teams are installed by `src/teams-installer`, which scans the source root for `<id>/TEAM.md` directories (ADR 35). Residual: `bash` writes are not gated.

## The dev-team blueprint

Six roles form a serial pipeline on `task` work units: Delivery Manager (DM, the leader) -> Researcher -> Architect -> Planner -> Implementer -> Reviewer -> DM. Each role subscribes to the topic the previous role publishes, so the pipeline structure itself serializes work; there is no central router and no agent knows another by identity. Ordering emerges from the subscription graph, not a platform state machine.

- DM - sole external entry point. Receives user prompts via the platform's `user.prompt` topic (addressed to its `agentKey`), records the task as a kanban card, and emits `task.recorded`. Enforces single-task-in-flight: extra prompts queue in its local FIFO until the active task terminates; its `notify` capability is constrained to `task.recorded`/`task.done`. On `task.review_passed` it finalizes externally and emits `task.done`; on `task.failed` it reports to the user with no follow-up event. Has no file-system tools.
- Researcher - on `task.recorded`, gathers external context and project documentation; presents facts in the `research` artifact and does not decide, emitting `notify(task.researched)`. Has no access to source files or contracts. Mandatory for all tasks in v1.
- Architect - on `task.researched`, the sole role that authors module contracts and inspects codebase structure beyond descriptors (via code-lens); updates `MODULE.md` files (only the Architect may author descriptors — see "Module descriptor and the sealed boundary") and emits `task.designed`.
- Planner - decides how to implement given research and contracts (`notify(task.planned, task.failed)`). On `task.review_failed` it re-plans; if the reviewer's objections are genuinely unresolvable, it emits `task.failed` instead of planning again (soft escalation).
- Implementer - follows the plan and module descriptors; emits `task.implemented`, or `task.failed` on a hard boundary violation it cannot reason around.
- Reviewer - evaluates output against the plan and contracts, always writes a `review` artifact, emits `task.review_passed` or `task.review_failed`. Cannot modify code.

### Re-plan loop

On `task.review_failed` the Reviewer kicks back to the Planner, and the Planner -> Implementer -> Reviewer segment re-runs. There is no hard iteration cap: the Planner judges whether the reviewer's objections are genuinely unresolvable and, if so, emits `task.failed` instead of planning again, carrying the unresolved objections so the DM can surface them to the user. `task.review_passed` ends the pipeline: the DM finalizes and emits `task.done`.

## Task model

A task has a durable `task_id` and can span multiple iterations and sessions; artifacts accumulate under keys like `{task_id}/plan`. The `task_id` is a team-level concept carried in notification prompt text - the platform treats it as opaque and never takes it as an input (ADR 37). Task progression is not recorded as platform state: it is visible from the task's kanban card status (`pending` / `in_progress` / `in_review` / `completed`) and from the artifacts accumulated under its `{task_id}` namespace (`research`, `design`, `plan`, `review`). The pipeline order falls out of the subscription graph - each role subscribes to its predecessor's topic - not from a transition table the platform authorizes.

Team artifacts: `research` (Researcher), `design` (Architect), `plan` (Planner), `review` (Reviewer). The task itself is tracked on the team's kanban board, not as an artifact.

## Module descriptor and the sealed boundary

Each source directory may hold a `MODULE.md` owned by the Architect: YAML frontmatter (the module contract - machine-readable exported signatures per file) plus markdown prose (the architectural narrative). It is mutated through the ordinary `write_file`/`edit` tools — only the Architect may author `MODULE.md`; for other roles this is prompt-enforced, not platform-gated. A descriptor governs only its immediate directory - no inheritance into subdirectories. The boundary rule is **no-new-exports**: agents cannot change a module's public signatures except via an Architect-authored contract update, and a directory without a descriptor defaults to no-new-exports, never implicitly opened. Signature text is opaque and language-defined, produced by code-lens language adapters. The path limit checks `write_file`/`edit_file` only - `bash` is ungated, so boundary enforcement polices cooperative file-tool writes, not the shell.

## Event topics

From the blueprint's view, agents coordinate on unscoped topic names - `user.prompt` (platform-managed user ingress, addressed to the DM's `agentKey`) plus the domain topics `task.recorded`, `task.researched`, `task.designed`, `task.planned`, `task.implemented`, `task.review_passed`, `task.review_failed`, `task.done`, `task.failed`. Subscription graph:

```
DM:          user.prompt (platform-managed, filtered on agentKey), task.review_passed, task.failed
Researcher:  task.recorded
Architect:   task.researched
Planner:     task.designed, task.review_failed
Implementer: task.planned
Reviewer:    task.implemented
```

The platform's actual wire model - `custom.${teamId}.` prefixed domain topics, typed event envelopes, `user.prompt` ingress addressed by `agentKey` - is defined in `jie-platform/03-event-system.md`; the names above are the team-level view of it, not a second wire format.

## v1 scope boundaries

Strictly one task in flight per team (no DM parallelism, priorities, or sub-teams); the only ingress is a direct user prompt via `user.prompt` (no GitHub/JIRA/cron/webhook triggers); every task runs the full pipeline (no trivial-task fast-path); every role has exactly one instance.

## Glossary (team-specific terms only)

Platform terms (Agent, Soul, Body, EventBus, Topic, Tool, `notify`, Artifact, Leader Agent, Team Blueprint, ...) are defined in `jie-platform/00-overview.md`.

| Term | Definition |
|---|---|
| **Task** | A unit of work with a durable `task_id`, tracked on the team's kanban board. Can span multiple iterations and sessions; work products accumulate as artifacts under its `task_id` namespace. |
| **Iteration** | One pass through the Planner -> Implementer -> Reviewer loop within a task (bounded by the Planner's judgment — see "Re-plan loop"). |
| **Module Descriptor** | A `MODULE.md` file in a source directory: YAML contract frontmatter + markdown prose. Owned by the Architect; governs only its immediate directory. |
| **Module Contract** | The YAML frontmatter of a Module Descriptor: exported symbol names and opaque canonical signatures per file. |
| **Workflow** | The serial pipeline DM -> Researcher -> Architect -> Planner -> Implementer -> Reviewer -> DM, with the re-plan loop between Planner, Implementer, and Reviewer. |
