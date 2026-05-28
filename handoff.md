# Handoff — Spec review complete, all groups (A–I) resolved

The spec review for the **Jie (界)** project is complete. All nine groups (A through I) have been reviewed, decided, applied, and pruned from the tracker. This file serves as the canonical reference for load-bearing decisions made during the review.

## Your job

If reopening the review — e.g. to address newly filed items or re-evaluate a past decision:

1. Read `specs/review-tracker.md` — the master tracker. New items are filed at the bottom.
2. Read `specs/00-overview.md` — glossary.
3. Read the relevant number spec files for the item.
4. Read `specs/backlog.md` — open items / backlog.

## Current state

All groups are **complete**. Every item in the tracker has reached a non-`pending` final state. Rows have been pruned; decisions live in the spec files.

## Round-trip decisions you must respect (do NOT relitigate)

### Group A — Event protocol & emission

- **Emission is via `notify(event_type, payload)`**, a built-in tool registered on every body. The body validates `event_type ∈ soul.publishes`, validates payload schema, runs the task-status guard (compare-and-append), then publishes. Validation/transition failures return tool-errors to the LLM (it can retry). If the LLM ends its response without `notify`, the body grants one grace turn; still no `notify` → body force-publishes `task.failed(missing_emission)`. Implicit emission is gone. See `07-agent-model.md` "The `notify` Tool" and "Event Loop and Explicit Emission".
- **DM never emits `task.failed` for pre-record failures.** Pre-record failures use `task.rejected` (bus event only, no `task_status` row). DM `publishes = ['task.recorded', 'task.rejected', 'task.done', 'task.failed']`. Transition table: "any non-terminal → failed by **any role including DM** (DM only on finalization failure)". See `08-role-definitions.md` "Allowed Transition Table".
- **`stream_id` is uint32**, demuxed by composite key `(agent_id, stream_id)`. See `03-event-system.md` identifier table and `11-tui.md`.
- **`session_id` is 16-hex uint64**, hashed over `(timestamp_ns, team_id, nonce)`. Collision treated as should-not-happen. See `03-event-system.md` subject schema.
- **Body event queue cap 8, assert/exit on overflow.** No drop-oldest. Supervisor restart + JetStream replay recovers. See `07-agent-model.md` Event Loop step 2.
- **Budgets renamed and reframed.** `hard_turn_cap` → `total_turn_budget`. Both are fixed, decrement-only, scoped to one event-handling loop, no resets. `error_turn_budget` decrements on any turn consuming a tool-result error. `total_turn_budget` decrements on every turn including the grace turn. Exhaustion → body force-publishes `task.failed` with explicit reason. See `00-overview.md` glossary, `07-agent-model.md` Failure Handling.
- **MCP glob semantics:** anchored shell-style. `*` matches any run (incl. empty); `?` matches exactly one. Case-sensitive. No other metacharacters. Zero-match patterns fail at startup. See `07-agent-model.md` ToolSpec block.
- **Iteration ownership:** DM inits to 1; everyone copies inbound; planner is the only role allowed to increment, only on `task.review_failed`. See `09-agent-lifecycle.md` "Iteration Ownership".
- **Researcher vs Architect boundary:** split tool surface (`read_module_doc` vs `read_module_contract`; `write_module_doc` is architect-only). See `08-role-definitions.md`.

### Group B — Task & session lifecycle

- **`task.done` is the canonical terminal for a successfully completed task.** Introduced as a new DM-emitted event (`publishes` and payload in `03-event-system.md`). DM emits it after finalizing the external ticket on observing `task.review_passed`. `review_passed` is a pipeline phase, not a terminal. `done` is permanent — no re-entry from `done`. See `08-role-definitions.md` "Allowed Transition Table" and "On Terminal Event".
- **`rejected` is not a `task_status` phase.** `task.rejected` is a pre-record bus event only; the body publishes it but performs no compare-and-append. No `task_status` row is created. See `07-agent-model.md` "Task Status and Idempotency" and `08-role-definitions.md` "On Pre-Record Failure".
- **Re-entry:** `failed → recorded` is a legal DM transition (fresh session, iteration = 1, artifacts accumulate). `done → recorded` is not legal. See `08-role-definitions.md` transition table.
- **NATS JetStream KV bucket (`task_state.{team}`) is gone.** Replaced by the `task_status` artifact type in the artifact store (SQLite, append-only, latest-per-task_id is canonical). Body's CAS migrates to `cas_append_task_status` in SQLite. New built-in tool `read_task_status(task_id)` auto-registered on all roles. See `04-artifact-store.md` and `07-agent-model.md` "Task Status and Idempotency".
- **Single-task-in-flight is a DM behavior, not a global lock.** DM uses `read_task_status(task_id)` per prompt; cross-task in-flight knowledge is the Memory module's responsibility (see `12-memory.md`). Per-task CAS remains the correctness floor. See `08-role-definitions.md` "Single-Task-In-Flight Invariant".
- **v1 keeps all artifacts and `task_status` rows indefinitely.** GC and compaction deferred to Storage Maintenance chapter (TBD). Open item #2 notes expected Day 2 JetStream stream TTL. Open item #3 closed (KV bucket gone). Open item #7 updated to include `task_status` chain compaction.
- **`task_id` normalization:** trim whitespace, validate charset `[A-Za-z0-9_-]`, max 64 chars, preserve case. Violation → `task.rejected`. See `03-event-system.md` Identifiers table.

### Group C — Boundary & external integrations

- **Prompt ingress is via NATS subjects `team.{team_id}.prompt` and `team.{team_id}.{agent_id}.prompt`.** The DM subscribes to `team.{team_id}.prompt` to receive user prompts. Per-agent prompt handling for non-DM roles is deferred but the subject namespace accommodates it. The TUI publishes prompts to these subjects. The TUI's read-only invariant is scoped to `session.*.task.*` only — it CAN publish to prompt subjects. A headless CLI (`jie prompt`) may also publish. See `02-protocol-stack.md` "Prompt Ingress", `03-event-system.md` subject schema, `08-role-definitions.md` DM subscriptions and "On Trigger".
- **Prompt subject durability:** `team.*.prompt` is ephemeral on JetStream (best-effort; user can resend). See `03-event-system.md` durability table.
- **DM finalization on success only.** On `task.done`: DM posts a comment + closes the external issue (JIRA/GitHub) if one exists, driven by the DM's system prompt detecting external origins. On `task.failed`: no external ticket update — summary stays internal (log + TUI). See `08-role-definitions.md` "On Terminal Event".
- **TUI is now the team's user-facing cockpit** (not just an observer). It sends prompts to agents and observes activity. See `11-ui/tui.md`.

### Group D — Code & module discipline

- **User-wins conflict detection for `write_module_contract` / `write_module_doc`**: the body internally caches the last `read_module_contract` and `read_module_doc` results per path. On write, the body re-reads the file and compares the relevant half against the cached version. Mismatch → tool error telling the architect to re-read and accommodate. No new tool parameters. See `05-module-descriptor.md` "User vs Architect Edits".
- **"Frozen" glossary entry covers both cases**: WITH descriptor (public symbols not in `exports` are frozen) and WITHOUT descriptor (entire directory frozen until Architect creates a descriptor). See `00-overview.md` glossary.

### Group E — Roles & pipeline shape

- **Researcher is mandatory for all tasks in v1.** No skip path. Trivial-task fast-path deferred to a new TBD chapter (`trivial-task-handling`, open item #13). See `backlog.md`.
- **`error_turn_budget` and `total_turn_budget` moved from `AgentSoul` to `AgentBody`.** Budgets are runtime body-level concerns, not soul identity. Defaults remain 30 and 200 for all roles. Per-role tuning deferred. See `07-agent-model.md`.
- **`run_tests` replaced by `bash` built-in on the Implementer.** The Implementer LLM discovers and runs the project's test/lint/build commands via `bash`. Reviewer no longer has `run_tests` (reviewer inspects code, doesn't execute). See `07-agent-model.md` "The `bash` Tool", `08-role-definitions.md` implementer and reviewer tool lists.

### Group F — Observability & debugging

- **`agent_id` format is `{role}-{8-hex}`**, e.g. `researcher-a1b2c3d4`. 8 hex chars from a random uint32, minted fresh on every process start. Collision is not a practical concern (4B values per role). See `03-event-system.md` Identifiers table and `07-agent-model.md` AgentBody.
- **Tool telemetry on the event bus**: two new ephemeral event types — `agent.tool.call` (before execution) and `agent.tool.result` (after). Payload carries metadata + middle-truncated input/output at a 4 KiB limit. Linked by `tool_call_id` (per-agent uint32 counter). Observer-only (no agent subscribes). On by default. See `03-event-system.md` (event types, payloads, durability, identifiers, subscriptions note) and `07-agent-model.md` "Tool Telemetry".
- **Open item #15 — CLI chapter**: new TBD chapter for the headless CLI (`jie prompt`, `jie status`, etc.), part of the UI family alongside TUI. See `backlog.md`.

### Group G — Process & deployment topology

- **`13-deployment.md`** created. Process topology: supervisor orchestrates agent bodies (one per role), Code-Lens, and TUI as OS processes. Single NATS server shared across teams. One SQLite artifact store per workspace.
- **MCP crash policy**: mid-session disconnect → next MCP call returns `mcp_server_unreachable` → body force-publishes `task.failed` and exits. Supervisor restarts the process. Same for NATS disconnect.
- **Code-Lens lifecycle**: per-team instance, started by supervisor before agent bodies. Crash recovery follows the standard MCP crash policy.
- **CLI entry points defined**: `jie start`, `jie prompt`, `jie status`, `jie stop`.
- **Package naming**: `packages/` layout — `core`, `agents`, `tools`, `storage`, `code-lens`, `tui`.

### Group H — Identifier & path conventions

- **`ArtifactId` is a ULID string**, not SQLite auto-increment. Storage-agnostic, timestamp-sortable. See `04-artifact-store.md`.
- **`read_module_descriptor` / `write_module_descriptor` renamed to `read_module_contract` / `write_module_contract`.** "Module Descriptor" is the whole `CONTEXT.md` file; "Module Contract" is the YAML frontmatter. Glossary and all role tool lists updated accordingly. See `00-overview.md`, `05-module-descriptor.md`, `08-role-definitions.md`.
- **All file paths are workspace-root-relative.** Workspace Root added to glossary. Applies to tool arguments, event payloads (including `descriptor_paths`), and config-relative paths. See `00-overview.md`, `03-event-system.md`.
- **Artifact store is workspace-scoped**, not team-scoped. See `13-deployment.md`.

### Group I — Glossary / TBD dependencies

- **Memory chapter written as `12-memory.md`.** Covers: MemoryStore interface, compaction (0.7x context-window threshold, oldest-turns summary, originals preserved on disk), context lifecycle (session start, turn loop, agent restart), persistence (SQLite `memory_turns` table, auto-flush every 10 turns), DM working memory (prompt queue, in-flight awareness), and LLM library integration. Backlog item #6 closed. All TBD references in `00`, `03`, `07`, `08`, `09` updated. See `12-memory.md`.

## Conventions established

- One file = one chapter. Edits target the relevant numbered spec.
- No emojis in spec files.
- Keep prose terse, technical, declarative.
- New event types must update both `03-event-system.md` (envelope/payload union, durability, subscriptions) and `08-role-definitions.md` (transition table, role `publishes`/`subscriptions` lists).
- New glossary terms go in `00-overview.md` only if they're load-bearing across multiple chapters.
- After a group closes, prune its rows from the tracker; persistent decisions live in the spec files, not the tracker.

## Cross-group dependencies

- Anything that changes emission mechanics or `task_status` semantics needs to stay consistent with Groups A, B, and C decisions. The `notify`-tool path, the task-status compare-and-append guard, the `task_status` artifact substrate, and the NATS prompt ingress subjects are all settled.
- `read_task_status` is a built-in tool auto-registered on all roles. Any change to role tool lists should preserve this.
- All file paths resolve relative to `workspace_root` (Group H). New tools or event payloads carrying file paths must follow this convention.
- Module Descriptor tools follow the `read/write_module_contract` (frontmatter) and `read/write_module_doc` (prose) naming. New tools operating on CONTEXT.md files must preserve this split.

## Tone

The user prefers honest, direct, opinionated guidance. No false agreement. Push back when weak ideas come up. Recommend the technically strongest option even when it requires more spec churn.

## Remaining open items

See `specs/backlog.md` for TBD chapters and deferred items. Key ones:

- Storage Maintenance chapter (#7)
- Module Boundary Enforcement chapter (#8)
- Custom Agents chapter (#9)
- Multi-Task Coordination chapter (#10)
- Trivial-Task Handling chapter (#13)
- Configuration chapter (#14)
- CLI chapter (#15)
- Security chapter (#16)
