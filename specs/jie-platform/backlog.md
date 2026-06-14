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
| 19 | **Prompt queue cap policy**: v1's `AgentBody` in-memory prompt queue is unbounded (matches pi-agent's `followUpQueue` / `steeringQueue`). Decide: cap value, drop policy (oldest vs reject-newest), observability (log only vs event). Spec: `06-agent-model.md` "Prompt Ingress & Queuing". | Day 2 |
| 20 | **Install / Publish infrastructure**: (a) publish `@cuzfrog/jie` to npm with `bun publish`, (b) host the install script at `https://install.jie.dev` (OS check, bun check, pinned version, idempotent re-run), (c) `jie upgrade` subcommand. v1: `git clone` + `bun link --global` is the only install path. | Day 2 |
| 21 | **Workspace indicator in the TUI**: surface both the CWD (where `jie` was invoked) and the discovered project dir (where `.jie/` lives, walked-up) so the user can see when the two diverge. v1 has no TUI, so this is a stub. When the TUI lands, render a status-bar line like `cwd: /project/subdir · project: /project`. The split matters because per `10-configuration.md` "Workspace Inference" project state files walk up while tool path resolution stays at CWD — silent divergence today. | Day 2 |
| 22 | **Artifact store BLOB + compression**: switch the `artifacts.content` column from `TEXT` to `BLOB` and add transparent gzip compression on write / decompression on read (via Bun's `CompressionStream`). v1 is text-only and the compression overhead is not worth the modest space savings; revisit when binary artifacts (PDFs, images) land. The validation rules (key charset `[A-Za-z0-9_./-]{1,256}`, content cap 5 MiB) stay the same. Spec: `05-artifact-store.md`, `06-agent-model.md` "Built-in Tools: `write_artifact` and `read_artifact`". | Day 2+ |
