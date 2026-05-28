# CLI (TBD)

Headless command-line interface for publishing prompts and observing team state. Part of the UI family alongside the TUI (`11-ui/tui.md`).

## Entry Points

| Command | Behavior |
|---|---|
| `jie start` | Start a full team (supervisor + all agent processes + Code-Lens + TUI). |
| `jie prompt <text>` | Publish a user prompt to `team.{team_id}.prompt` for the DM. |
| `jie status [task_id]` | Read and display current task status from the artifact store. |
| `jie stop` | Send SIGTERM to the supervisor, which cascades to all child processes. |

## Scope

- **Prompt submission.** Publishes to `team.{team_id}.prompt` and/or `team.{team_id}.{agent_id}.prompt` subjects (see `03-event-system.md` prompt subjects, `02-protocol-stack.md` Prompt Ingress).
- **Task status queries.** Reads the artifact store directly or via NATS; displays pipeline phase, iteration, artifacts.
- **Event streaming to stdout.** Subscribes to `session.*.task.*` (durable) and `session.*.agent.stream.*` (ephemeral) for live output.
- **Config path resolution.** Discovers `.jie/config.yaml` via the same mechanism as the supervisor (walk-up or `--config` flag).

## Cross-References

- `02-protocol-stack.md` — Prompt Ingress subjects, transport
- `03-event-system.md` — prompt subject schema, durability
- `11-ui/messaging-protocol.md` — prompt envelope format, correlation flow
- `14-configuration.md` — config discovery
- `13-deployment.md` — supervisor process model
- Backlog #15 — formal CLI surface (this chapter)
- Backlog #14 — configuration chapter
