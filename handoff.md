# Group A Handoff — CLI Steering + Monitoring Chapter

## Summary

Steered the CLI spec (A8) through a design review, rewriting the command surface and semantics. Created a new Monitoring chapter (A10) to cover liveness/health. Removed obsolete patterns (`--config` flag, task_id-as-field in prompts, `--follow` watching) and replaced with cleaner equivalents.

## Steering Decisions

### CLI Command Surface (Final)

| Command | Before | After |
|---|---|---|
| `jie` | _(did not exist)_ | Idempotent: start backend + TUI if fresh; TUI only if running. |
| `jie start` | Ran backend + TUI; had `--detach` | Backend only, foreground, logs `session.*.task.>` to stdout. No detach. |
| `jie ui` | _(did not exist)_ | TUI only. |
| `jie prompt <text>` | Had `--task-id`, `--follow`, `--json` | Text in, text out. Request-response via `reply_id` (8-hex). No `--task-id`, no `--follow`. DM responds with `PromptResponse`. |
| `jie status` | Task status from artifact store | **Renamed** to `jie query-task` — same function, no detail mode distinction. |
| `jie doctor` | _(did not exist, replaces `jie status`)_ | Team health: subscribes to `supervisor.{team_id}.heartbeat` and `agent.{team_id}.>.heartbeat`, collects for 2s, reports agent idle/busy/error status. |
| `jie stop` | SIGTERM supervisor via pid file | Unchanged. |

### Config Discovery

- `--config <path>` flag **removed** from all commands and from `14-configuration.md`. Walk-up from CWD only.

### PromptMessage

- `task_id` field **removed**. Users embed task references in the text content.
- `reply_id` field **added** (8-hex) for CLI request-response.
- DM response envelope: `PromptResponse { reply_id, content, error?, timestamp }` — no task-specific fields.

### Prompt Response Pattern

- CLI publishes `PromptMessage` with `reply_id`, subscribes to `team.{team_id}.response.{reply_id}`, waits for `PromptResponse`.
- DM interprets any text: task creation, status query, general Q&A. Responds with text in `content`, or error in `error`.
- TUI uses fire-and-forget (no `reply_id`) and correlates via v1 single-task-in-flight invariant.

## New Chapter: Monitoring (A10)

`specs/15-monitoring.md` — covers heartbeat subjects, envelopes, status definitions, agent discovery, and staleness rules. Resolves the TBD `team.{team_id}.agent.online` reference in `11-ui/tui.md:29` (C9).

## Resolution: C9 — TUI Agent Discovery

**Was:** `11-ui/tui.md:29` had a TBD reference to a non-existent `team.{team_id}.agent.online` event.

**Now:** The TUI discovers agents by subscribing to `agent.{team_id}.>.heartbeat`. Each unique `(role, agent_id)` becomes a tab. No dedicated online/offline event needed — heartbeat traffic drives discovery. The `event_id` format (8-hex) also serves as reply_id format.

## Files Changed

| File | Change |
|---|---|
| `specs/11-ui/cli.md` | Full rewrite: new command surface, removed `--config`, `--task-id`, `--follow`; added `jie`, `jie ui`, `jie doctor`, `jie query-task`; request-response prompt pattern |
| `specs/15-monitoring.md` | **New** — heartbeat subjects, envelopes, intervals, status definitions (idle/busy/error), agent discovery, staleness |
| `specs/03-event-system.md` | Added `team.{team_id}.response.{reply_id}`, `supervisor.{team_id}.heartbeat`, `agent.{team_id}.{role}.{agent_id}.heartbeat` subjects. Removed `task_id` from prompt payload. |
| `specs/11-ui/messaging-protocol.md` | Removed `task_id` from `PromptMessage`. Added `reply_id`. Renamed `DmResponse` → `PromptResponse`. Simplified DM subscription flow. TUI correlation simplified (single-task-in-flight). |
| `specs/11-ui/tui.md` | Updated agent discovery TBD → `15-monitoring.md` heartbeat |
| `specs/02-protocol-stack.md` | Added `team.{team_id}.response.{reply_id}` to prompt ingress table |
| `specs/13-deployment.md` | Updated CLI entry point list; removed `--config` from config discovery |
| `specs/14-configuration.md` | Removed all `--config` flag references |
| `AGENTS.md` | Minor update |
| `handoff.md` | This file (rewritten for fresh start) |

## For Next Agent

- **Installation chapter** is the next Day 1 item to write — cover NATS setup/installation as a dedicated spec.
- `09-agent-lifecycle.md:80` still says `max_iterations` is "configurable per task" with a TBD mechanism — should reference team-level default from `14-configuration.md`.
- Group B (Open Backlog Items) B1–B5 remain as Day 2 decisions.
- Supervisor must publish `supervisor.{team_id}.heartbeat` every 5s per `15-monitoring.md`.
