# TUI

Lives in `packages/tui/`. The TUI is one *observer* of the team. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes and the **invariants** it must hold.

## Inputs

The TUI obtains everything it needs from two existing surfaces:

1. **NATS events** under `session.{session_id}.>`. Specifically:
   - `task.*` events for pipeline progression and outcomes.
   - `agent.stream.chunk` / `agent.stream.end` for live LLM output.
   - `task.failed` for failure surfacing.

   For session discovery, the TUI may subscribe to `session.*.task.recorded` and let the user pick.

2. **Artifact Store** (read-only) for content referenced by events. The TUI uses `read(artifact_id)` and `list({ task_id })` from `04-artifact-store.md`.

The TUI gets nothing else. It does not have a private channel to agents and does not call `core` directly.

## Invariants

- **Read-only.** The TUI MUST NOT publish to NATS. No `task.*` emission, no signals, no fake events, ever.
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
