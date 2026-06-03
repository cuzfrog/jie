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

With heartbeats removed, the TUI derives agent status from the following:

| TUI display | Derived from |
|---|---|
| Agent is alive | AgentBody is instantiated and subscribed to EventBus |
| Agent is busy | `agent.stream.chunk` or `agent.tool.call` was recently received for this agent, and no `agent.idle` has followed |
| Agent is idle | `agent.idle` event received; no subsequent streaming or tool activity |
| Agent errored | Domain event received with `error:` prefix in `prompt` (e.g., `error: "missing_emission"`) |

The TUI does not need a heartbeat interval — it observes events as they arrive on the bus. Since everything is in-process, there is no network partition or missed-event concern.

## Error Surfacing

When an agent encounters an unrecoverable condition, it publishes a terminal event via `notify` with an error string as the `prompt` (e.g., `error = "missing_emission"`), then transitions to idle. The TUI surfaces the error to the user.
