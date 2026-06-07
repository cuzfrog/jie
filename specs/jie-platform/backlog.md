# Platform Backlog

Items prioritized by Day N.

| # | Item | Priority |
|---|---|---|
| 2 | NATS JetStream configuration details: stream limits, retention, replication. Exact policy (TTL, size cap). | Day 2 |
| 7 | **Storage Maintenance chapter**: artifact retention, GC, archival, backup. Status chain compaction, JetStream pruning. v1 keeps everything indefinitely. | Day 2 |
| 9 | **Custom Agents chapter**: schema and loading for user-defined agents vs built-in team blueprints. | Day 2 |
| 16 | **Security chapter**: multi-tenant NATS isolation, auth, access control. Bash tool OS-level sandboxing (chroot, container, seccomp). v1: path-based enforcement only; soft isolation deferred. | Day 3 |
| 17 | **Reliability chapter**: agent crash recovery, supervisor force-publishing on behalf of crashed agents, status consistency after crashes, prompt queue persistence across leader restarts. v1: assumes agents don't crash mid-task. | Day 2 |
| 18 | **Memory chapter review**: leader prompt queue durability, compaction policy tuning, token budget defaults, snapshot frequency, restart recovery edge cases. | Day 2 |
| 19 | **Prompt queue cap policy**: v1's `AgentBody` in-memory prompt queue is unbounded (matches pi-agent's `followUpQueue` / `steeringQueue`). Decide: cap value, drop policy (oldest vs reject-newest), observability (log only vs event). Spec: `05-agent-model.md` "Prompt Ingress & Queuing". | Day 2 |
