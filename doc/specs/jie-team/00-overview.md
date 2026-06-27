# Jie Team — Default Built-in Team Blueprint

The built-in team-blueprint for software development. Defines a team of six roles working through a serial pipeline on `task` work units. The default leader is the **Delivery Manager (DM)**.

Runs on top of `jie-platform`. The platform provides the agent model, event bus, artifact store, memory, and deployment — the team blueprint adds roles, events, task lifecyclie, and workflow.

---

## Glossary

| Term | Definition |
|---|---|
| **Team** | A named group of agents sharing the same EventBus and workspace, defined by a team blueprint. |
| **Blueprint** | The definition that maps roles to souls, event topics, and workflow subscriptions. Converted to a running team by the platform. |
| **Role** | A specific agent position in the team. Each role has defined topic subscriptions, tools, and a system prompt. |
| **Task** | A unit of work with a durable `task_id` (e.g. a JIRA key or DM-minted prompt id). A task can span multiple planner→implementer→reviewer cycles. Artifacts accumulate under the task. |
| **Iteration** | One pass through the planner→implementer→reviewer loop within a task. Iteration starts at 1; the reviewer can kick back to the planner to start iteration N+1. Bounded by `max_iterations` per task (default 5). |
| **Task Status** | An append-only set of status rows per `task_id` in the artifact store. The latest row per `task_id` is the canonical current state: phase, iteration, and updated_at. `done` is the only permanent phase — once reached, the task cannot be re-entered. |
| **sealed** | A module boundary that cannot be altered by any agent except the Architect. Defined by the Module Descriptor. |
| **Module Contract** | The YAML frontmatter of the Module Descriptor. Machine-readable exported signatures per file. Manipulated exclusively through `read_module_contract` and `write_module_contract`. |
| **Module Descriptor** | A `CONTEXT.md` file located in a source directory. Contains a YAML frontmatter (contract) and markdown prose (doc). Owned by the Architect. |
| **Leader Agent** | The DM role — sole external-facing entry point for the team. Auto-subscribes to `leader.prompt` via platform auto-wiring. Enforces single-task-in-flight invariant. |
| **Workflow** | The serial pipeline: DM → Researcher → Architect → Planner → Implementer → Reviewer → DM, with an iteration loop between Planner→Implementer→Reviewer. |
| **Notify** | The `notify(topic, prompt)` tool — sole inter-agent communication channel. Agents publish to topics; subscribers receive the prompt as a synthetic user message. |
