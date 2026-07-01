# Monitoring

Observability is derived from the EventBus. Observers (TUI, `-p` mode, future diagnostic tooling) subscribe to platform events to track agent activity and team health. There is no separate monitoring pipeline or metrics collection in v1.

## Observable Events

| Event | Source | What it tells |
|---|---|---|
| `agent.stream.chunk` | Any agent | Live LLM output, per-chunk. TUI renders it; `-p` prints it. |
| `agent.stream.end` | Any agent | An LLM turn completed. TUI can advance the chat pane. |
| `agent.tool.call` | Any agent | Which tool is about to run, with truncated input. |
| `agent.tool.result` | Any agent | Tool outcome, duration, error status. |
| `agent.idle` | Any agent | Agent ready for new work. TUI updates tab status; `-p` uses it to know when to exit. |
| `{domain_topic}` | Any agent (via `notify`) | Work-unit lifecycle progression (team-defined). TUI shows pipeline timeline. |

Tool telemetry events (`agent.tool.call`, `agent.tool.result`) and domain events from the team blueprint constitute the full observable surface of a running team. Any diagnostic tooling or external monitor can subscribe to these events on the EventBus.

## Agent Status (in TUI)

The TUI derives agent status from the following (after ADR 22 — the body no longer publishes `agent.idle` at startup; the boot signal is `{team_id}.team.loaded`):

| TUI display | Derived from |
|---|---|
| Agent is alive | The agent's `(role, agent_key)` is listed in a `{team_id}.team.loaded` event for the active team. The TUI subscribes to `{team_id}.team.loaded` per loaded team and populates the agents-panel on receipt. |
| Agent is busy | `agent.turn.start` for this agent was received AND no subsequent `agent.idle` has followed; OR `agent.stream.chunk` / `agent.tool.call` was recently received for this agent and no `agent.idle` has followed. |
| Agent is idle | Default state. `agent.idle` for this agent was received AND no subsequent `agent.turn.start` has been observed; OR the agent has published no events yet (initial state). |
| Agent errored | Domain event received with `error:` prefix in `prompt` (e.g., `error: "..."`) |

The "still busy" derivation in the `busy` row above is what the body-side alternation (Event-Order Contract — see `03-event-system.md`) makes reliable: a body's `agent.idle` is always preceded by an `agent.turn.start` for the same turn, so the TUI's per-body state machine cannot observe `agent.idle` without a preceding `agent.turn.start` having been seen.

The TUI does not need a heartbeat interval — it observes events as they arrive on the bus. Since everything is in-process, there is no network partition or missed-event concern. For the queue-pickup flicker (a brief `agent.idle` between turns when the body picks up the next queued prompt), the TUI should debounce: `agent.idle` followed by `agent.turn.start` for the same body within ~50 ms is "still busy". See `ui/tui-state.md` "Out of scope for v0.2" (queue-pickup debounce).

## Error Surfacing

When an agent encounters an unrecoverable condition, the body publishes a terminal event via `notify` with an error string as the `prompt` (e.g., `error: "..."`), then publishes `agent.idle`. The TUI surfaces the error to the user.
