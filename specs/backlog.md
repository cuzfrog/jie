# Backlog

Items are prioritized by Day N. Use Day N as the Priority.

| # | Item | Priority |
|---|---|---|
| 2 | NATS JetStream configuration details: stream limits, retention, replication. Exact policy (TTL, size cap) is a Day 2 decision. | Day 2 |
| 4 | code-lens: confirm scope — exports + import graph sufficient for Day 1, call-graph edges deferred. | Day 2 |
| 5 | External integration: how external sources (GitHub, JIRA, cron, webhooks) notify the team and trigger DM. v1: only direct user prompt. | Day 2 |
| 7 | **Storage Maintenance chapter**: artifact retention, GC, archival, backup. `task_status` chain compaction, JetStream pruning. v1 keeps everything indefinitely. | Day 2 |
| 8 | **Module Boundary Enforcement chapter**: frozen-rule algorithm, language-adapter interface, default policy, failure reporting. | Day 2 |
| 9 | **Custom Agents chapter**: schema and loading for user-defined agents vs built-in roles. | Day 2 |
| 10 | **Multi-Task Coordination chapter**: DM parallelism, priorities, preemption, sub-teams. v1: strictly one task at a time. | Day 2 |
| 11 | `max_iterations` default and per-task override mechanism (default 5; task artifact field or team config?). | Day 2 |
| 12 | Per-role budget tuning: confirm `error_turn_budget=30` and `total_turn_budget=200` defaults per role. | Day 2 |
| 13 | **Trivial-Task Handling chapter**: fast-path for version bumps, typo fixes. v1 runs full pipeline. | Day 2 |
| 16 | **Security chapter**: multi-tenant NATS isolation, auth, access control. v1: soft isolation; hard isolation deferred. | Day 3 |
