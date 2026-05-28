# Jie (界) — Overview

> "Constraints liberate, liberties constrain."

## Project Name: `Jie (界)`

界（Jie），在汉字中代表着不可逾越的边界、绝对的范畴与固若金汤的隔离防线。

## Project Purpose

Jie (界) is an orchestration framework engineered to enforce structural boundaries that lock down entropy in agentic development.

---

## Glossary

| Term | Definition |
|---|---|
| **Frozen** | A frozen module boundary cannot be altered by any agent except the Architect. In a directory **with** a Module Descriptor: any public/exported symbol not listed in `exports` is frozen — the agent must not change it. Symbols listed in `exports` may be changed only to match the listed signature exactly. In a directory **without** a Module Descriptor: the entire directory is frozen — no public symbol change is allowed until the Architect creates a descriptor authorizing specific contracts. |
| **Module Contract** | The YAML frontmatter portion of the Module Descriptor. Machine-readable set of exported/public type and function signatures per file. Manipulated exclusively through `read_module_contract` and `write_module_contract`. |
| **Module Descriptor** | A `CONTEXT.md` file (filename configurable) located in a source directory. Contains a YAML frontmatter (the **contract**) and markdown prose (the **doc**). Owned by the Architect or the user. A directory may have at most one descriptor. |
| **Artifact** | A persisted work product: a task, research note, or plan. Stored in the Artifact Store, indexed by `task_id`. Referenced on the event bus only by `artifact_id`. |
| **Compaction** | The clearing or summarizing of an agent's LLM context window. An internal operation of the Memory subsystem (see `12-memory.md`). Effectively makes a long-lived agent behave as if freshly started. |
| **Role** | The combination of an `AgentBody` (runtime container) and an `AgentSoul` (behavioral definition). A role is immutable once assigned — the soul cannot be swapped at runtime. |
| **Soul** | Declares an agent's responsibilities, tool budget, and event subscriptions. Carries no mutable runtime state. |
| **Body** | The concrete runtime process. Holds a soul, an EventBus client, and an ArtifactStore client. Executes tool calls on behalf of the soul. No inheritance. |
| **Team** | A named group of agent processes (one per role) sharing the same NATS bus, separated from other teams by topic namespace. |
| **Workspace Root** | The root directory of the user's codebase under Jie management. Defined in team config as `workspace_root`. All file paths throughout Jie — tool arguments (`read_file`, `write_file`, `read_module_contract`, `bash` workdir, Code-Lens tool paths), event payloads (e.g. `descriptor_paths`), and config-relative paths — resolve relative to the workspace root. |
| **Task** | A unit of work with a durable `task_id` (e.g. a JIRA key or DM-minted prompt id). A task can span multiple sessions. Artifacts accumulate under the task across sessions. |
| **Session** | A single sequential workflow run for a task. All events in a session share the same `session_id` embedded in the NATS subject. Sessions are transient. |
| **Iteration** | One pass through the planner→implementer→reviewer loop within a session. Iteration starts at 1; the reviewer can kick back to the planner to start iteration N+1. Bounded by `max_iterations` per task (default 5). |
| **Task Status** | An append-only set of `task_status` artifact rows per `task_id` in the artifact store (SQLite). The latest row per `task_id` is the canonical current state: phase, iteration, and updated_at. The body uses an optimistic compare-and-append on this row as the idempotency gate before publishing events. Terminal phases are `done` (finalized by DM, permanent) and `failed` (re-enterable by DM). `task.rejected` is a pre-record event that writes no `task_status` row. Agents read current status via the built-in `read_task_status(task_id)` tool. |
| **Error turn budget** | Per agent. Fixed budget initialized at the start of each event-handling loop. Decrements by one on every turn that consumes at least one tool-result error. Pure-thinking and all-success turns do not decrement it. Does not reset within the loop. Default 30. |
| **Total turn budget** | Per agent. Fixed budget initialized at the start of each event-handling loop. Decrements by one on every LLM turn unconditionally. Safety net against pathological loops. Default 200. |
