# TUI

Lives in `packages/tui/`. The TUI is the team's user-facing cockpit: it observes all agent activity and sends user prompts to agents. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes/generates and the **invariants** it must hold.

## Inputs

The TUI obtains everything it needs from two existing surfaces:

1. **NATS events** under `session.{session_id}.>`. Specifically:
   - Domain lifecycle events for pipeline progression and outcomes.
   - `agent.stream.chunk` / `agent.stream.end` for live LLM output.
   - Terminal events for failure surfacing.

   For session discovery, the TUI may subscribe to `session.*.>` and let the user pick.

2. **Artifact Store** (read-only) for content referenced by events. The TUI uses `read(artifact_id)` and `list({ work_id })` from `04-artifact-store.md`.

The TUI gets nothing else. It does not have a private channel to agents and does not call `core` directly.

## Prompt Sending

The TUI publishes user prompts to NATS. This is the TUI's sole write path:

- Prompts without an explicit agent target go to `team.{team_id}.prompt` — the leader agent receives these.
- Prompts targeting a specific agent (when the user is viewing that agent's tab) go to `team.{team_id}.{agent_id}.prompt`.

Payload: `{ prompt: string, work_id?: string }`.

The TUI discovers active agents via heartbeat traffic on `agent.{team_id}.>.heartbeat` (see `11-monitoring.md`). Each unique `(role, agent_id)` becomes a tab. `agent_id` is available in the heartbeat envelope and in stream metadata.

## Invariants

- **Read-only on pipeline subjects.** The TUI MUST NOT publish to `session.*` or any domain event subject on NATS. Prompt ingress (`team.{team_id}.prompt`, `team.{team_id}.{agent_id}.prompt`) is the sole write the TUI performs.
- **No state of its own beyond UI state.** All authoritative state lives on the bus and in the Artifact Store. The TUI is a pure projection.
- **Replay-tolerant.** On reconnect to NATS, the TUI replays durable subjects and accepts the loss of ephemeral stream chunks since disconnect.
- **Out-of-band oblivious.** Internal agent operations (compaction, memory loads) are not on the bus and so the TUI does not display them.

## Information Available

For any active session the TUI can present, derived purely from inputs above:

- The pipeline timeline: which events have fired in which order.
- The current work-unit status and any iteration counter.
- The most recent artifact of each type for the current work unit (via `list({ work_id })`).
- Live LLM output for any agent currently streaming, demuxed by `(agent_id, stream_id)`.
- Failure detail when a terminal event arrives.

How any of this is rendered — tabs, panes, charts, markdown, plain text — is left to the TUI implementation.

## Offline and Degraded States

- **Leader offline / not running.** When no leader heartbeat is observed, the TUI should indicate that the leader is unreachable. Prompt input should remain available but the TUI should warn that prompts cannot be delivered. When the leader heartbeat returns, restore prompt input to active. If a prompt was published during downtime, it is lost (prompts are ephemeral); the TUI should inform the user to re-send.
- **Agent restart mid-session.** When an agent's `agent_id` changes (detected via heartbeat), the TUI drops the old tab and creates a fresh one. Live stream chunks from the old `agent_id` are discarded. The pipeline resumes where the restarted agent picks up from JetStream replay.
- **Leader restart → prompt queue cleared.** When the leader restarts (new `agent_id` via heartbeat), any prompts queued in the leader's in-memory buffer are lost (see `08-memory.md`). The TUI should surface this to the user.
