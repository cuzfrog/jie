# ADR 19: Multi-team Coexistence — v1 Single-team, Day 2+ Multi-team Design

## Status

Accepted. v1 ships a single-team model. The handle's public surface is `{ bus, stop }` only; the team info is exposed via the `team.loaded` event. Multi-team coexistence (on-demand `loadTeam`, `bodies()`, per-team lifecycle on the handle) is a Day 2+ concern.

The v1 decision and the Day 2+ design are both recorded here so the v1 code, the ADR, and the Day 2+ plan stay consistent.

## Context

The earlier v1 design let one `jie` process host multiple teams' bodies, with on-demand team loading via `handle.loadTeam(teamId)`, an in-memory `Map<team_id, AgentBody[]>` exposed as `handle.bodies()`, and a `handle.teamId` getter for the active team. The TUI's `/team <id>` slash command was the consumer of `loadTeam`; the handle's `bodies()` map was the source of truth for "which teams are alive".

A round-6 simplification (matching the v1 surface in `addrs/13-platform-entry-function.md`) reduced the handle to `{ bus, stop }`. Reasons:

- **v1 has no TUI** (ADR 15). The `/team <id>` slash command — the only planned v1 consumer of `loadTeam` — does not exist in v1. The handle's `loadTeam` would be a public method with zero v1 callers.
- **`bodies()` and `teamId` were the TUI's bootstrap hooks.** Without a TUI, the CLI is the only consumer of the handle. The CLI's `createApp` orchestrator already captures the team info from the `team.loaded` event (per ADR 25) and does not need `bodies()` to derive it.
- **Day 2+ still wants the design.** Multi-team processes (TUI swapping teams, multiple teams running in one process) are a real product direction. The design captured below is the Day 2+ target; the v1 code does not implement it, but the spec documents the path.

## Decision

### v1 handle surface

```typescript
interface JiePlatform {
  bus: EventBus;
  stop: (timeoutMs?: number) => Promise<void>;
}
```

The handle does not expose `loadTeam`, `bodies()`, or `teamId`. The startup team is the only team in the process. Team info (teamId, leaderRole, leaderKey) is captured by the CLI's `createApp` from the `team.loaded` event and passed to `runPrint` (the only v1 prompt-flow consumer); the TUI, when it lands in Day 2+, will subscribe to the bus and derive the same info from the event stream.

### v1 team-scoped event subjects

The event-bus subject scheme distinguishes platform-managed subjects from client-defined subjects (which carry the `custom.` prefix to mark them as non-platform):

| Channel | Subject | Notes |
|---|---|---|
| Leader prompt ingress | `{team_id}.leader.prompt` | TUI/CLI publishes via `Events.userPrompt(sender, teamId, prompt)` (default-target branch); the active team's leader auto-subscribes. |
| Agent's own key | `custom.{team_id}.{agent_key}` | Direct-addressing; the agent with this key auto-subscribes; `notify` publishes via `Events.custom`. The TUI also reaches a specific agent via `Events.userPrompt(sender, teamId, prompt, targetAgentKey)`. |
| Domain topic | `custom.{team_id}.{topic}` | `notify` tool publishes via `Events.custom`; agents subscribe via `subscribe:` frontmatter (the platform prefixes `custom.{team_id}.` at body construction). |
| Team roster | `{team_id}.team.loaded` | Platform publishes via `Events.teamLoaded`; one-shot per team load. |
| Platform events | `agent.stream.chunk`, `agent.stream.end`, `agent.tool.call`, `agent.tool.result`, `agent.prompt.queue.update`, `agent.turn.start`, `agent.idle` | Un-scoped; `team_id` in the envelope. |

The team-blueprint author writes unscoped names (`leader.prompt`, `leader-1`, `task.recorded`) in `.md` frontmatter and in `notify` calls. The platform prefixes `custom.{team_id}.` at body construction (for `notify`-driven subscriptions and direct addressing) and at publish time (for `notify`). The two platform-managed subjects (`{team_id}.leader.prompt`, `{team_id}.team.loaded`) use the un-prefixed `{team_id}.` form. The agent's view is un-scoped; the bus's view is team-scoped (with `custom.` prefix for client-defined topics). This scheme is Day 2+ ready: a second team's bodies will not see the first team's events on the un-scoped platform subjects because the envelope's `team_id` disambiguates.

### v1 `team.loaded` event

Published once at startup, after all bodies' `start()` returns. Payload:

```typescript
{ team_id: string, agents: { role: string, agent_key: string, is_leader: boolean }[] }
```

`is_leader` is per the loader's leader-identification rules. This is the only team-routing event in v1; the CLI subscribes to it and captures the team info. The TUI (Day 2+) does the same.

### Day 2+ multi-team design (reference, not v1 code)

When the TUI lands and multi-team processes become a real product, the handle will regain the lifecycle surface:

```typescript
interface JiePlatform {
  bus: EventBus;
  loadTeam(teamId: string): Promise<void>;
  bodies(): Map<team_id, AgentBody[]>;
  teamId: string;
  stop: (timeoutMs?: number) => Promise<void>;
}
```

- **`loadTeam(teamId)`** consults `bodies()`: if loaded, returns immediately; if not, parses the blueprint, constructs bodies, registers them on the bus, records the mapping, and publishes one `{team_id}.team.loaded` event for the new team. The previously-active team is **not** stopped; the TUI's view switch is a separate concern owned by the TUI itself.
- **`bodies()`** returns `Map<team_id, AgentBody[]>`; consumers that need per-team bodies read `bodies().get(teamId)`.
- **`teamId`** is the handle's current "active team" — the TUI's `/team <id>` sets it, the TUI filters platform events by it. (Note: the body construction in `startJie` already reads `opts.teamId`, so the `teamId` getter just exposes the value the handle is using.)
- **`team.loaded` is one-shot per team load.** It is not republished on team swap-back. Observers that came back to a previously-loaded team use the buffer / cache they already built up.
- The handle's `Map<team_id, session_id>` (per ADR 18) is also extended in Day 2+ to cover all loaded teams; the v1 single-team map is the one-entry case of that.

The TUI's `/team <id>` slash command (Day 2+) calls `loadTeam(teamId)` (idempotent) and then switches its view. Slash-command behavior that previously implied "hot-swap" (which destroyed the old team) is rewritten to "view switch" (which leaves the old team running).

### Leader prompt queue across team view-switches (Day 2+)

The old team's leader body is not destroyed on swap, so its in-memory prompt queue is preserved. The TUI just stops publishing to the old team's prompt topic; the old team continues to process its queue in the background. When the TUI switches back, the TUI resumes publishing to the old team's prompt topic; the old team picks up where it left off.

## Rationale

- **v1 has no TUI** (ADR 15). A public `loadTeam` with no v1 caller is dead-on-arrival API surface. v1 ships what v1 needs.
- **v1 is a one-shot prompt flow.** The CLI's `createApp` orchestrator is the only prompt-flow consumer. The orchestrator already captures team info from the bus; `bodies()` would be redundant.
- **The Day 2+ design is the right long-term shape.** Multi-team processes are a real product direction. Recording the design now lets Day 2+ land without re-deriving the subject scheme or the team-routing rules.
- **The team-scoped subject scheme is v1-correct.** Even with a single team in v1, the scheme scales to N teams without code changes — the platform's bus already routes per-`{team_id}.` prefix. Day 2+ ships the lifecycle methods, not a different bus.
- **The `team.loaded` event is v1-correct.** The shape carries `is_leader`, which the TUI's agents-panel needs (per ADR 25). The CLI uses the same fields.

## Consequences

- `packages/jie-platform/start.ts` exports `createJiePlatform` returning a `JiePlatform` with only `{ bus, stop }`. `loadTeam` and `bodies()` are not on the interface. The internal `loadTeam` (in the function body) loads only the startup team; the internal `loadedTeams` map is a closure field, not exposed.
- The CLI's `createApp` orchestrator (in `packages/jie-cli/app.ts`) subscribes to the startup team's `team.loaded` event before calling `createJiePlatform`, captures the team info from the event, and passes it to `runPrint`. The orchestrator does not call `loadTeam` or read `bodies()` (they don't exist on the public surface).
- `doc/addrs/13-platform-entry-function.md` — `JiePlatform` is `{ bus, stop }`; the multi-team section (ADR 19 above) is the Day 2+ reference.
- `doc/addrs/25-tui-is-event-driven.md` — section 1 ("TUI's permitted surface on `JieHandle`") lists `bus`, `stop` for v1, with a Day 2+ note for `loadTeam` / `bodies()` / `teamId`.
- `doc/specs/jie-platform/06-agent-model.md` and `doc/specs/jie-platform/ui/tui.md` — references to `loadTeam` / `bodies()` are rewritten as "Day 2+ multi-team, see ADR 19".
- `doc/specs/jie-platform/09-deployment.md` Startup Sequence — the "Branch by mode" step uses the v1 handle's `bus` and `stop`; the multi-team step (load additional teams) is moved to a Day 2+ reference.
- `00-user-scenarios.md` and `11-monitoring.md` — unchanged (v1 is single-team; the v1 surface is what those documents describe).
- `backlog.md` — the multi-team design is the Day 2+ reference target.

## Out of scope (v1)

- **Multi-team per process** (Day 2+): the v1 single-team startup is a one-entry case of the design above. When the TUI lands, the handle regains `loadTeam` and `bodies()` per the Day 2+ shape; the v1 code's subject scheme and `team.loaded` semantics are unchanged.
- **TUI's `/team <id>` slash command** (Day 2+): TUI is a stub in v1 (ADR 15).
- **Team-swap body destruction** (Day 2+): the "old team is destroyed on swap" semantic is incorrect and was rewritten to "view switch" long before v1; the v1 single-team startup is the simplest case.
