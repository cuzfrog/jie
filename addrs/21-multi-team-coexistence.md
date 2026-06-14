# ADR 21: Multi-team coexistence in v1 — team-scoped subjects, on-demand loading

## Status
Accepted 2026-06-13.

## Context

The TUI's team-swap step 1 said "All current agent bodies receive a graceful stop signal." Per the user's correction on 2026-06-13, that is wrong. A team is not destroyed by a swap; it keeps its state and runs in the background. A client (TUI) can switch back at any time, and the team is unaware of the UI's observation. The TUI is a pure passive observer; it does not control agent behavior.

This contradicts:

- `03-event-system.md` Subject Schema: *"No `team_id` prefix — one process runs one team. Multi-team isolation is a Day 2 concern."*
- `ui/tui.md` "Model and Team Hot-Swap" → "Team" step 1: *"All current agent bodies receive a graceful stop signal (bounded 10s shutdown, same as `jie` exit)."*

The "Day 2" deferral of multi-team isolation is hereby pulled forward into v1: a single `jie` process can host multiple teams' bodies, each autonomous, each addressable through team-scoped event-bus subjects.

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

- `startJie()` resolves and loads the startup team (from settings/CLI). The startup team's bodies are constructed and registered on the bus.
- Other teams are loaded on demand. The `JieHandle` tracks loaded teams in `Map<team_id, AgentBody[]>`.
- `swapTeam(teamId)` consults the map: if loaded, switch the TUI's view; if not, parse the new team's blueprint, construct bodies, register on the bus, record in the map, then switch the view. The previously-active team is **not** stopped or destroyed.
- `JieHandle.stop()` stops all loaded teams (the only lifecycle-changing operation besides initial load).

### TUI role

The TUI publishes prompts to `{active_team_id}.leader.prompt`. The TUI's slash commands (`/team <id>`) write settings and switch the TUI's view; they do not initiate body lifecycle changes. Slash-command behavior that previously implied "hot-swap" (which destroyed the old team) is rewritten to "view switch" (which leaves the old team running).

### Leader prompt queue across `swapTeam`

The old team's leader body is not destroyed on swap, so its in-memory prompt queue is preserved. The TUI just stops publishing to the old team's prompt topic; the old team continues to process its queue in the background. When the TUI switches back, the TUI resumes publishing to the old team's prompt topic; the old team picks up where it left off.

## Implications

- **`JieHandle`** gains `loadTeam(teamId)`, `bodiesFor(teamId)`, `rolesFor(teamId)`. `swapTeam` is rewritten to consult `loadedTeams` and lazy-load if absent.
- **TUI's per-`(team_id, agent_key)` event buffer** (existing spec) is the right granularity. Platform events are filtered by the active team's `team_id` (from the envelope).
- **TUI's `roles` parameter** to `startTUI` is the startup team's roles. The TUI re-queries the handle for new teams' roles on swap.
- **`Cascade: Agent Load Failure`** (per ADR-style spec rule in `10-configuration.md`) applies per-team: a team that fails to load is rejected, but other loaded teams continue.

## References

- Closes Gap 3 of fresh review pass 3 (`review-tracker.md`).
- Modifies: `03-event-system.md` (subject scheme, envelope), `06-agent-model.md` (notify / subscribe / auto-subscribe prefixing), `ui/tui.md` (team swap, slash commands, agent discovery), `addrs/15-platform-entry-function.md` (JieHandle), `09-deployment.md` (startJie steps), `10-configuration.md` (Cascade: per-team).
- Supersedes the previous Gap 2 closure (queue on swap) which was framed against graceful-stop semantics; the body is now preserved, not destroyed.
