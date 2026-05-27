# Handoff — Groups A and B complete and pruned, pick next group

You are picking up an in-progress spec review for the **Jie (界)** project at `/Volumes/workspace/epam/designs/jie`. Groups A and B are **complete** and their rows have been pruned from the tracker. Pick the next pending group from `specs/review-tracker.md`. Each group is largely self-contained; you can address it in a fresh agent context.

## Your job

Drive the user through the next group's items one at a time, interview-style. For each item: discuss → decide → apply spec edits → mark `resolved` (or `conditional` / `deferred` / `dropped`) in `specs/review-tracker.md`. Be direct, technically honest, and willing to push back on weak ideas.

## Read these first (in order)

1. `specs/review-tracker.md` — the master tracker. Group status table tells you which group is `pending`. Within a group, walk items top-to-bottom.
2. `specs/00-overview.md` — glossary.
3. The numbered spec files referenced in your group's rows (the **Spec** column).
4. `specs/12-open-items.md` — open items list.

## Current state

### Closed groups

- **Group A — Event protocol & emission.** Complete. Rows pruned. Decisions are persisted in the spec files; key load-bearing items are summarized below.
- **Group B — Task & session lifecycle.** Complete. Rows pruned. Decisions are persisted in the spec files; key load-bearing items are summarized below.

### Pending groups (pick one)

| Group | Theme |
|---|---|
| C | Boundary & external integrations (#6, #28) |
| D | Code & module discipline (#13, #26) |
| E | Roles & pipeline shape (#12, #21, #25) |
| F | Observability & debugging (#7, #9) |
| G | Process & deployment topology (#8, #14, #16, #29, #30) |
| H | Identifier & path conventions (#17, #23, #24) |
| I | Glossary / TBD dependencies (#27) |

Suggested next: **C** (foundational boundary question — how prompts reach the DM — has downstream bearing on the DM FIFO and deployment topology). But follow the user's preference.

## Group A decisions you must respect (do NOT relitigate)

- **Emission is via `notify(event_type, payload)`**, a built-in tool registered on every body. The body validates `event_type ∈ soul.publishes`, validates payload schema, runs the task-status guard (compare-and-append), then publishes. Validation/transition failures return tool-errors to the LLM (it can retry). If the LLM ends its response without `notify`, the body grants one grace turn; still no `notify` → body force-publishes `task.failed(missing_emission)`. Implicit emission is gone. See `07-agent-model.md` "The `notify` Tool" and "Event Loop and Explicit Emission".
- **DM never emits `task.failed` for pre-record failures.** Pre-record failures use `task.rejected` (bus event only, no `task_status` row). DM `publishes = ['task.recorded', 'task.rejected', 'task.done', 'task.failed']`. Transition table: "any non-terminal → failed by **any role including DM** (DM only on finalization failure)". See `08-role-definitions.md` "Allowed Transition Table".
- **`stream_id` is uint32**, demuxed by composite key `(agent_id, stream_id)`. See `03-event-system.md` identifier table and `11-tui.md`.
- **`session_id` is 16-hex uint64**, hashed over `(timestamp_ns, team_id, nonce)`. Collision treated as should-not-happen. See `03-event-system.md` subject schema.
- **Body event queue cap 8, assert/exit on overflow.** No drop-oldest. Supervisor restart + JetStream replay recovers. See `07-agent-model.md` Event Loop step 2.
- **Budgets renamed and reframed.** `hard_turn_cap` → `total_turn_budget`. Both are fixed, decrement-only, scoped to one event-handling loop, no resets. `error_turn_budget` decrements on any turn consuming a tool-result error. `total_turn_budget` decrements on every turn including the grace turn. Exhaustion → body force-publishes `task.failed` with explicit reason. See `00-overview.md` glossary, `07-agent-model.md` Failure Handling.
- **MCP glob semantics:** anchored shell-style. `*` matches any run (incl. empty); `?` matches exactly one. Case-sensitive. No other metacharacters. Zero-match patterns fail at startup. See `07-agent-model.md` ToolSpec block.
- **Iteration ownership:** DM inits to 1; everyone copies inbound; planner is the only role allowed to increment, only on `task.review_failed`. See `09-agent-lifecycle.md` "Iteration Ownership".
- **Researcher vs Architect boundary:** split tool surface (`read_module_doc` vs `read_module_descriptor`; `write_module_doc` is architect-only). See `08-role-definitions.md`.

## Group B decisions you must respect (do NOT relitigate)

- **`task.done` is the canonical terminal for a successfully completed task.** Introduced as a new DM-emitted event (`publishes` and payload in `03-event-system.md`). DM emits it after finalizing the external ticket on observing `task.review_passed`. `review_passed` is a pipeline phase, not a terminal. `done` is permanent — no re-entry from `done`. See `08-role-definitions.md` "Allowed Transition Table" and "On Terminal Event".
- **`rejected` is not a `task_status` phase.** `task.rejected` is a pre-record bus event only; the body publishes it but performs no compare-and-append. No `task_status` row is created. See `07-agent-model.md` "Task Status and Idempotency" and `08-role-definitions.md` "On Pre-Record Failure".
- **Re-entry:** `failed → recorded` is a legal DM transition (fresh session, iteration = 1, artifacts accumulate). `done → recorded` is not legal. See `08-role-definitions.md` transition table.
- **NATS JetStream KV bucket (`task_state.{team}`) is gone.** Replaced by the `task_status` artifact type in the artifact store (SQLite, append-only, latest-per-task_id is canonical). Body's CAS migrates to `cas_append_task_status` in SQLite. New built-in tool `read_task_status(task_id)` auto-registered on all roles. See `04-artifact-store.md` and `07-agent-model.md` "Task Status and Idempotency".
- **Single-task-in-flight is a DM behavior, not a global lock.** DM uses `read_task_status(task_id)` per prompt; cross-task in-flight knowledge is the Memory module's responsibility (TBD). Per-task CAS remains the correctness floor. See `08-role-definitions.md` "Single-Task-In-Flight Invariant".
- **v1 keeps all artifacts and `task_status` rows indefinitely.** GC and compaction deferred to Storage Maintenance chapter (TBD). Open item #2 notes expected Day 2 JetStream stream TTL. Open item #3 closed (KV bucket gone). Open item #7 updated to include `task_status` chain compaction.
- **`task_id` normalization:** trim whitespace, validate charset `[A-Za-z0-9_-]`, max 64 chars, preserve case. Violation → `task.rejected`. See `03-event-system.md` Identifiers table.

## How to drive the interview

- Use the `question` tool to present options; recommend one when you have a clear opinion.
- Apply spec edits with the `edit` tool immediately after each decision (don't batch; the user prefers seeing edits land in real time).
- Update `specs/review-tracker.md`: change status, fill in **Decision** and **Edits** columns. Keep resolved rows in place during the group; once the group is fully complete, prune the rows the same way prior groups were pruned (replace the table with a one-line "complete; rows pruned" note pointing at the relevant spec files). This keeps tracker context lean.
- When all items in your group reach a non-`pending` final state, mark the group as `complete` in the tracker's group status table, prune its rows, then stop and summarize what changed.

## Conventions established

- One file = one chapter. Edits target the relevant numbered spec.
- No emojis in spec files.
- Keep prose terse, technical, declarative.
- New event types must update both `03-event-system.md` (envelope/payload union, durability, subscriptions) and `08-role-definitions.md` (transition table, role `publishes`/`subscriptions` lists).
- New glossary terms go in `00-overview.md` only if they're load-bearing across multiple chapters.
- After a group closes, prune its rows from the tracker; persistent decisions live in the spec files, not the tracker.

## Cross-group dependencies you may hit

- Anything that changes emission mechanics or `task_status` semantics needs to stay consistent with Groups A and B decisions above. The `notify`-tool path, the task-status compare-and-append guard, and the `task_status` artifact substrate are all settled.
- Group C #6 (how the user prompt reaches the DM) has downstream bearing on the DM's FIFO mechanics and on Group G's deployment topology. Resolve it before Group G if possible.
- Group F (#7, #9) cares about logged failure modes. Group A added several: `not_in_publishes`, `invalid_payload`, `illegal_transition`, `missing_emission`, `error_budget_exhausted`, `turn_budget_exhausted`, plus the queue-overflow assert. All loggable.
- Group E #21 (reviewer-specific budget defaults) is a values question now that naming is settled.
- `read_task_status` is now a built-in tool auto-registered on all roles. Any group that modifies role tool lists should preserve this.

## Tone

The user prefers honest, direct, opinionated guidance. No false agreement. Push back when weak ideas come up. Recommend the technically strongest option even when it requires more spec churn.

## Stop condition

All items in your chosen group reach a non-`pending` final state, that group's rows are pruned, AND the group's status row is updated to `complete`. Then summarize what changed and hand back.
