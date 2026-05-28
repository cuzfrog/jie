# TUI

Lives in `packages/tui/`. The TUI is the team's user-facing cockpit: it observes all agent activity and sends user prompts to agents. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes/generates and the **invariants** it must hold.

## Inputs

The TUI obtains everything it needs from two existing surfaces:

1. **NATS events** under `session.{session_id}.>`. Specifically:
   - `task.*` events for pipeline progression and outcomes.
   - `agent.stream.chunk` / `agent.stream.end` for live LLM output.
   - `task.failed` for failure surfacing.

   For session discovery, the TUI may subscribe to `session.*.task.recorded` and let the user pick.

2. **Artifact Store** (read-only) for content referenced by events. The TUI uses `read(artifact_id)` and `list({ task_id })` from `04-artifact-store.md`.

The TUI gets nothing else. It does not have a private channel to agents and does not call `core` directly.

## Prompt Sending

The TUI publishes user prompts to NATS. This is the TUI's sole write path:

- Prompts without an explicit agent target go to `team.{team_id}.prompt` — the DM receives these and creates a new task.
- Prompts targeting a specific agent (when the user is viewing that agent's tab) go to `team.{team_id}.{agent_id}.prompt`.

Payload for both: `{ prompt: string, task_id?: string }`.

The TUI discovers active agents via heartbeat traffic on `agent.{team_id}.>.heartbeat` (see `15-monitoring.md`). Each unique `(role, agent_id)` becomes a tab. `agent_id` is available in the heartbeat envelope and in stream metadata (`agent_id` field in the `agent.stream.*` envelope).

## Invariants

- **Read-only on pipeline subjects.** The TUI MUST NOT publish to `session.*` or any `task.*` subject on NATS. Prompt ingress (`team.{team_id}.prompt`, `team.{team_id}.{agent_id}.prompt`) is the sole write the TUI performs.
- **No state of its own beyond UI state.** All authoritative state lives on the bus and in the Artifact Store. The TUI is a pure projection.
- **Replay-tolerant.** On reconnect to NATS, the TUI replays durable subjects (`session.*.task.*`) and accepts the loss of ephemeral stream chunks since disconnect.
- **Out-of-band oblivious.** Internal agent operations (compaction, memory loads) are not on the bus and so the TUI does not display them.

## Information Available

For any active session the TUI can present, derived purely from inputs above:

- The pipeline timeline: which events have fired in which order, in which iteration.
- The current iteration number and `max_iterations`.
- The most recent artifact of each type for the current task (via `list({ task_id })`).
- Live LLM output for any agent currently streaming, demuxed by the composite key `(agent_id, stream_id)` (an agent's `stream_id` is unique only within that agent).
- Failure detail when `task.failed` arrives.

How any of this is rendered — tabs, panes, charts, markdown, plain text — is left to the TUI implementation.
