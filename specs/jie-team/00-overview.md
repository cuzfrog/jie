# Jie Team — Default Built-in Team Blueprint

The built-in team-blueprint for software development. Defines a team of six roles working through a serial pipeline on `task` work units. The default leader is the **Delivery Manager (DM)**.

Runs on top of `jie-platform`. The platform provides the agent model, event bus, artifact store, memory, and deployment — the team blueprint adds roles, events, task lifecycle, and workflow.

---

## Glossary

| Term | Definition |
|---|---|
| **Team** | A named group of agent processes sharing the same NATS bus and workspace, defined by a team blueprint. |
| **Blueprint** | The definition that maps roles to souls, event types, and workflow subscriptions. Converted to a running team by the platform. |
| **Role** | A specific agent position in the team. Each role has defined subscriptions, publishes, tools, and a system prompt. |
| **Task** | A unit of work with a durable `task_id` (e.g. a JIRA key or DM-minted prompt id). A task can span multiple sessions. Artifacts accumulate under the task across sessions. |
| **Session** | A single sequential workflow run for a task. All events in a session share the same `session_id` embedded in the NATS subject. Sessions are transient. |
| **Iteration** | One pass through the planner→implementer→reviewer loop within a session. Iteration starts at 1; the reviewer can kick back to the planner to start iteration N+1. Bounded by `max_iterations` per task (default 5). |
| **Task Status** | An append-only set of status rows per `task_id` in the artifact store. The latest row per `task_id` is the canonical current state: phase, iteration, and updated_at. `done` is the only permanent phase — once reached, the task cannot be re-entered. |
| **Frozen** | A module boundary that cannot be altered by any agent except the Architect. Defined by the Module Descriptor. |
| **Module Contract** | The YAML frontmatter of the Module Descriptor. Machine-readable exported signatures per file. Manipulated exclusively through `read_module_contract` and `write_module_contract`. |
| **Module Descriptor** | A `CONTEXT.md` file located in a source directory. Contains a YAML frontmatter (contract) and markdown prose (doc). Owned by the Architect. |
| **Leader Agent** | The DM role — sole external-facing entry point for the team. Subscribes to `team.{team_id}.prompt`. Enforces single-task-in-flight invariant. |
| **Workflow** | The serial pipeline: DM → Researcher → Architect → Planner → Implementer → Reviewer → DM, with an iteration loop between Planner→Implementer→Reviewer. |
