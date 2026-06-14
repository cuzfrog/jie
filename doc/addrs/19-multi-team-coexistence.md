# ADR 19: Multi-team coexistence in v1 — team-scoped subjects, on-demand loading

## Status

Accepted. A single `jie` process can host multiple teams' bodies, each autonomous, each addressable through team-scoped event-bus subjects.

## Context

The TUI's team-swap step previously said "All current agent bodies receive a graceful stop signal." That is wrong. A team is not destroyed by a swap; it keeps its state and runs in the background. A client (TUI) can switch back at any time, and the team is unaware of the UI's observation. The TUI is a pure passive observer; it does not control agent behavior.

This contradicts:

- `03-event-system.md` Subject Schema: *"No `team_id` prefix — one process runs one team. Multi-team isolation is a Day 2 concern."*
- `ui/tui.md` "Model and Team Hot-Swap" → "Team" step 1: *"All current agent bodies receive a graceful stop signal (bounded 10s shutdown, same as `jie` exit)."*

The "Day 2" deferral of multi-team isolation is pulled forward into v1.

## Decision

### EventBus subject scheme: team-scoped for team channels, un-scoped for platform events

| Channel | Subject | Notes |
|---|---|---|
| Leader prompt ingress | `{team_id}.leader.prompt` | TUI publishes; the active team's leader auto-subscribes. |
| Agent's own key | `{team_id}.{agent_key}` | Direct-addressing; the agent with this key auto-subscribes. |
| Domain topic | `{team_id}.{topic}` | `notify` tool, `subscribe:` field. |
| Platform events | `agent.stream.chunk`, `agent.stream.end`, `agent.tool.call`, `agent.tool.result`, `agent.queue.update`, `agent.turn.start`, `agent.idle` | Un-scoped; `team_id` in the envelope. |

The team-blueprint author writes unscoped names (`leader.prompt`, `leader-1`, `task.recorded`) in `.md` frontmatter and in `notify` calls. The platform prefixes `{team_id}.` at body construction (for subscriptions) and at publish time (for `notify`). The agent's view is un-scoped; the bus's view is team-scoped.

### AgentEvent envelope gains `team_id`

`team_id` is added to `AgentEvent`. Bodies fill it in from their team's `team_id`; the TUI uses it to filter platform events by the active team. Subject parsing is not required.

### On-demand team loading

- `startJie()` resolves and loads the startup team (from settings/CLI). The startup team's bodies are constructed and registered on the bus. After all bodies' `start()` returns, the handle publishes one `{team_id}.team.loaded` event for the startup team (per ADR 22).
- Other teams are loaded on demand. The `JieHandle` tracks loaded teams in `Map<team_id, AgentBody[]>`.
- `loadTeam(teamId)` consults the map: if loaded, return immediately; if not, parse the new team's blueprint, construct bodies, register on the bus, record in the map, and publish one `{team_id}.team.loaded` event for the newly-loaded team. The previously-active team is **not** stopped or destroyed. The TUI's view switch is a separate concern owned by the TUI itself, not a handle method. The `team.loaded` event is **one-shot per team load**: it is not republished when the TUI swaps back to a previously-loaded team; observers that came back to it use the buffer / cache they already built up.
- `JieHandle.stop()` stops all loaded teams (the only lifecycle-changing operation besides initial load).

### TUI role

The TUI publishes prompts to `{active_team_id}.leader.prompt`. The TUI's slash commands (`/team <id>`) write settings and switch the TUI's view; they do not initiate body lifecycle changes. Slash-command behavior that previously implied "hot-swap" (which destroyed the old team) is rewritten to "view switch" (which leaves the old team running).

### Leader prompt queue across team view-switches

The old team's leader body is not destroyed on swap, so its in-memory prompt queue is preserved. The TUI just stops publishing to the old team's prompt topic; the old team continues to process its queue in the background. When the TUI switches back, the TUI resumes publishing to the old team's prompt topic; the old team picks up where it left off.

## Implications

- **`JieHandle`** gains `loadTeam(teamId)`, `bodiesFor(teamId)`, `rolesFor(teamId)`. `loadTeam` is the single lifecycle-changing call; the TUI's view switch is a separate concern. Per ADR 22, `waitForIdle` is **removed** from the handle; the CLI's `-p` mode owns its own idle gate.
- **TUI's per-`(team_id, agent_key)` event buffer** (existing spec) is the right granularity. Platform events are filtered by the active team's `team_id` (from the envelope). The TUI's "agent is alive" derivation moves from `agent.idle` at startup (the prior decision, reversed by ADR 22) to `{team_id}.team.loaded`.
- **TUI's `roles` parameter** to `startTUI` is the startup team's roles, sourced by the CLI from `handle.rolesFor(startupTeamId)` after `startJie` returns. The handle is the single source of truth; the CLI does not parse the manifest separately before `startJie`. The TUI re-queries the handle for new teams' roles on swap.
- **`Cascade: Agent Load Failure`** (per `10-configuration.md`) applies per-team: a team that fails to load is rejected, but other loaded teams continue. The cascade covers **model-resolution failures** in addition to tool-resolution failures: any agent whose `model:` cannot be resolved (no `model:` in `.md`, and merged settings do not provide a resolvable default) → team load fails with the same error message as `startJie`'s pre-check: "No model has been selected, please login and select a default model." The TUI displays the error in the input area; the previously-active team keeps running.
