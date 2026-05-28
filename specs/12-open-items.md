# Open Items

| # | Item | Priority |
|---|---|---|
| 1 | ~~Define `run_tests` tool contract: what constitutes a test command, how is the project test runner configured per workspace~~ — **closed**: `run_tests` replaced by `bash` built-in on the Implementer; the Implementer LLM discovers and runs the project's test command. Reviewer does not run tests. | ~~Day 1~~ |
| 2 | NATS JetStream configuration details: stream limits, retention, replication. For the durable `session.*.task.*` stream, a finite retention policy is expected (e.g. message-age TTL of 30 days or a stream size cap); the exact policy is a Day 2 config decision. | Day 2 |
| 3 | ~~NATS KV bucket configuration: `task_state.{team}` policy (TTL, history, replication)~~ — **closed**: `task_state` substrate replaced by `task_status` artifact type in the artifact store (SQLite). No separate KV bucket. | ~~Day 2~~ |
| 4 | code-lens: confirm scope — exports + import graph sufficient for Day 1, call-graph edges deferred | Day 2 |
| 5 | External integration: how external sources (GitHub, JIRA, cron, webhooks) notify the team and trigger DM to pull a task. Currently the only supported trigger is a direct user prompt to the DM. | Deferred |
| 6 | **Memory chapter (TBD)**: agent context lifecycle, compaction triggers and policy, persistence and reloading across restarts, integration with `pi` (or chosen LLM lib) | TBD |
| 7 | **Storage Maintenance chapter (TBD)**: artifact retention, GC, archival, backup. Scope includes: deletion/compaction of artifact rows for `done` tasks after a configurable retention window; compaction of `task_status` chains (collapse N rows per terminal `task_id` to one); JetStream stream pruning. v1 keeps everything indefinitely. | TBD |
| 8 | **Module Boundary Enforcement chapter (TBD)**: frozen-rule algorithm, language-adapter interface, default policy for missing descriptors (frozen by default; architect must explicitly approve any boundary change), failure reporting. | TBD |
| 9 | **Custom Agents chapter (TBD)**: schema and loading for user-defined agents (vs built-in roles whose tools/subscriptions/system prompts/publishes are fixed in `core`). | TBD |
| 10 | **Multi-Task Coordination chapter (TBD)**: DM behavior beyond single-task-in-flight — parallelism, priorities, preemption, sub-teams. v1 enforces strictly one task at a time. | TBD |
| 11 | `max_iterations` default and per-task override mechanism (currently default 5; how is per-task override surfaced — task artifact field? team config?). | Day 2 |
| 12 | Per-role budget tuning: confirm `error_turn_budget=30` and `total_turn_budget=200` defaults are appropriate for each role; reviewer in particular may want different values. | Day 2 |
| 13 | **Trivial-Task Handling chapter (TBD)**: fast-path for tasks that do not require the full pipeline (e.g. version bumps, typo fixes). May involve a new role or a DM-selectable alternate path. v1 runs all tasks through the full pipeline. | TBD |
| 14 | **Configuration chapter (TBD)**: project-level and team-level configuration surface. Scope includes: workspace root discovery, test/lint command resolution, language-adapter selection, budget overrides per role, `max_iterations` per-task override, and the config file format/loading path. | TBD |
| 15 | **CLI chapter (TBD)**: headless CLI interface (`jie prompt`, `jie status`, etc.) for publishing prompts and observing team state. Part of the UI family alongside TUI (`11-ui/tui.md`). Scope includes: prompt submission, task status queries, event streaming to stdout, config path resolution. The headless CLI is referenced in `03-event-system.md` prompt subjects and Group C decisions; this chapter formalizes its surface. | TBD |
