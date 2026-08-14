# Jie Team - Overview

`jie-team` is a team-blueprint framework on top of `jie-platform`. The platform provides the agent model, event bus, artifact store, memory, and deployment; the team blueprint adds roles, domain event topics, and the workflow. Team blueprints are passive content under `src/manifest/teams/<id>/` — no `index.ts`, no runtime surface (ADR 11). Capability limits are declared as tool specs in each role's `tools:` list and enforced generically by the platform (ADR 37). Each `<role>.md` file declares that role's model, tools, subscriptions, skills, and system prompt; `TEAM.md` declares the leader, an optional `description:` for the team-selection UI, and any shared `additional-agents:` refs (ADR 40). The prose body of `TEAM.md` is ignored.

Bundled blueprints and shared agents ship under `src/manifest/` and are installed by `src/manifest/installer`.

## Task model

A task has a durable `task_id` and can span multiple iterations and sessions; work products accumulate as artifacts under keys scoped by `task_id`. The platform treats `task_id` as opaque. Progress is visible from the artifacts and from kanban cards when a team uses them. Ordering emerges from the subscription graph in each manifest, not from a platform transition table.

## Module descriptor and the sealed boundary

Each source directory may hold a `MODULE.md`: YAML frontmatter (the module contract) plus markdown prose. The `no-new-exports` rule means agents cannot change a module's public signatures except via a contract update. A directory without a descriptor defaults to `no-new-exports`. Path limits on `write_file`/`edit_file` enforce the boundary cooperatively; `bash` is ungated.

## v1 scope boundaries

One task in flight per team; the only ingress is a direct user prompt; every role has exactly one instance; no sub-teams or external triggers.

## Glossary

Platform terms (Agent, Soul, Body, EventBus, Topic, Tool, `notify`, Artifact, Leader Agent, Team Blueprint, ...) are defined in `jie-platform/00-overview.md`.

| Term | Definition |
|---|---|
| **Task** | A unit of work with a durable `task_id`. Can span multiple iterations and sessions; work products accumulate as artifacts under its `task_id` namespace. |
| **Iteration** | A re-plan or re-review pass within a task. |
| **Module Descriptor** | A `MODULE.md` file in a source directory: YAML contract frontmatter + markdown prose. Governs only its immediate directory. |
| **Module Contract** | The YAML frontmatter of a Module Descriptor: exported symbol names and opaque canonical signatures per file. |
