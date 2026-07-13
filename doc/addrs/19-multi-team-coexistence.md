# ADR 19: Multi-team Coexistence — v1 Single-team, Day 2+ Multi-team Design

## Status

Accepted. v1 ships a single-process model in which the platform loads every installed team at startup (via `handle.start()` → `TeamManager.loadAll()`). The handle's public surface is `{ teams, settings, start, prompt, subscribe, interrupt, execute, stop }`; it does **not** expose active-team state (`loadTeam` / `bodies()` / `teamId`) — those were dropped per ADR 26 in favour of eager loading and consumer-owned selection.

This ADR records the v1 subject scheme (which carries over to multi-team Day 2+ unchanged) and points at ADR 26 for the current single-process shape.

## Context

The earlier v1 design let one `jie` process host multiple teams' bodies, with on-demand team loading via `handle.loadTeam(teamId)`, an in-memory `Map<team_id, AgentBody[]>` exposed as `handle.bodies()`, and a `handle.teamId` getter for the active team. The TUI's `/team <id>` slash command was the consumer of `loadTeam`; the handle's `bodies()` map was the source of truth for "which teams are alive".

A round-6 simplification (matching the v1 surface in `addrs/13-platform-entry-function.md`) reduced the handle to `{ bus, stop }`. Reasons:

- **v1 has no TUI** (ADR 15). The `/team <id>` slash command — the only planned v1 consumer of `loadTeam` — does not exist in v1. The handle's `loadTeam` would be a public method with zero v1 callers.
- **`bodies()` and `teamId` were the TUI's bootstrap hooks.** Without a TUI, the CLI is the only consumer of the handle. The CLI's `createApp` orchestrator already captures the team info from the `team.loaded` event (per ADR 25) and does not need `bodies()` to derive it.
- **Day 2+ still wants the design.** Multi-team processes (TUI swapping teams, multiple teams running in one process) are a real product direction. The design captured below is the Day 2+ target; the v1 code does not implement it, but the spec documents the path.

## Decision

### v1 handle surface

See ADR 26 for the canonical description. The v1 shape is:

```typescript
interface JiePlatform {
  readonly teams:    ReadonlyMap<string, TeamIdentity>;
  readonly settings: Settings;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe<T extends EventType>(topic: T, callback: (env: EventEnvelope<T>) => void): () => void;
  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(): void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}
```

No `loadTeam`, `bodies()`, or `teamId`. `handle.teams` is populated by `start()` calling `TeamManager.loadAll()` (per the eager-load loop and ADR 24); consumers pick the team from `handle.teams` + their own intent (CLI's `args.teamId ?? handle.settings.defaultTeam ?? "minimal"`; TUI's `focused` reducer state).

### v1 team-scoped event subjects

The event-bus subject scheme distinguishes platform-managed subjects from client-defined subjects (which carry the `custom.` prefix to mark them as non-platform):

| Channel | Subject | Notes |
|---|---|---|
| Leader prompt ingress | `{team_id}.leader.prompt` | TUI/CLI publishes via `Events.userPrompt(sender, teamId, prompt)` (default-target branch); the addressed team's leader auto-subscribes. |
| Agent's own key | `custom.{team_id}.{agent_key}` | Direct-addressing; the agent with this key auto-subscribes; `notify` publishes via `Events.custom`. The TUI also reaches a specific agent via `Events.userPrompt(sender, teamId, prompt, targetAgentKey)`. |
| Domain topic | `custom.{team_id}.{topic}` | `notify` tool publishes via `Events.custom`; agents subscribe via `subscribe:` frontmatter (the platform prefixes `custom.{team_id}.` at body construction). |
| Team roster | `system.team.loaded` | Platform publishes via `Events.teamLoaded`; one-shot per team load, payload `{ teamId, agents: [{ role, agent_key, is_leader }, ...] }` (sorted alphabetically by role). |
| Platform events | `agent.stream.chunk`, `agent.stream.end`, `agent.tool.call`, `agent.tool.result`, `agent.prompt.queue.update`, `agent.turn.start`, `agent.idle` | Un-scoped; `team_id` in the envelope. |

The team-blueprint author writes unscoped names (`leader.prompt`, `leader-1`, `task.recorded`) in `.md` frontmatter and in `notify` calls. The platform prefixes `custom.{team_id}.` at body construction (for `notify`-driven subscriptions and direct addressing) and at publish time (for `notify`). The two platform-managed subjects (`{team_id}.leader.prompt`, plus the un-scoped `system.team.loaded`) use the un-prefixed form (or `system.` for the latter). The agent's view is un-scoped; the bus's view is team-scoped (with `custom.` prefix for client-defined topics). Multiple teams' bodies coexist on the same bus; subject keys disambiguate routing.

### v1 `system.team.loaded` event

Published once per team that loaded successfully at startup. Payload:

```typescript
{ teamId: string, agents: { role: string, agentKey: string, isLeader: boolean }[] }
```

`isLeader` is per the loader's leader-identification rules. Consumers that want to know what teams are alive read the `JiePlatform.teams` map; consumers that want to observe the live body roster subscribe to `system.team.loaded`.

### Multi-team Day 2+ (reference)

When a future revision needs on-demand team loading (e.g. installing a new team at runtime), it lands outside the public `JiePlatform` interface: the platform's eager load at startup is sufficient for "all installed teams loaded"; on-demand loading is internal, not an interface change. The reason consumers do **not** need a `loadTeam`/`bodies()`/`teamId` API is the subject scheme: a second team's bodies already coexist on the same bus, identified by `{team_id}.` prefix and `team_id` on the envelope. The TUI's view switch is a reducer concern; the TUI's prompt always carries an explicit `teamId`.

### Leader prompt queue across team view-switches (Day 2+)

The addressed team's leader body is not destroyed on TUI view-switch, so its in-memory prompt queue is preserved. The TUI just stops publishing to the old team's prompt topic; the old team continues to process its queue in the background. When the TUI switches back, the TUI resumes publishing to the old team's prompt topic; the old team picks up where it left off.

## Rationale

- **The subject scheme carries over to Day 2+.** A second team's bodies already coexist on the same bus; the prefix scheme scales to N teams without code changes. The TUI's view switch is a reducer concern.
- **`teams: ReadonlyMap` is the v1 source of truth.** Consumers that need a list of loaded teams read the map; the `system.team.loaded` event is the live-update analogue for the body roster.
- **No `bodies()` on the public surface.** Bodies are a private implementation detail. The TUI subscribes to events; the CLI captures leader info from the `createApp` orchestrator's resolved `team`; neither needs direct body access.

## Consequences

- `packages/jie-platform/jie-platform.ts` — `JiePlatform` interface contains the fields/methods listed above; no active-team state.
- `packages/jie-platform/team/team-manager.ts` — `TeamManager.load(id): Promise<TeamIdentity>` returns the parsed identity; `listInstalled(): string[]` enumerates them. Eager loading at startup iterates the list and silently omits teams whose manifest / model fails (per ADR 13 + ADR 26).
- The CLI's `createApp` orchestrator (`packages/jie-cli/app.ts`) picks the team from `handle.teams` and `args.teamId ?? handle.settings.defaultTeam`. No `loadTeam` call.
- `doc/addrs/13-platform-entry-function.md` — `JiePlatform` shape reflects this ADR.
- `doc/addrs/26-platform-no-active-team-state.md` is the canonical source for the "no active team on the platform" decision; this ADR covers the subject-scheme and event-payload shapes that ADR 26 references.
- `doc/specs/jie-platform/06-agent-model.md` and `doc/specs/jie-platform/ui/tui-overview.md` — references to `loadTeam` / `bodies()` are removed; the TUI uses `handle.teams` + bus events.
- `doc/specs/jie-platform/09-deployment.md` Startup Sequence — the platform publishes `system.team.loaded` once per loaded team; consumer selection is documented per ADR 26.

## Out of scope

- **On-demand team loading at runtime.** A future revision may need to install and load a team without process restart; the design lands in a future ADR and lives outside the public interface. Until then, "all installed teams loaded at startup" is sufficient.
- **TUI's `/team <id>` mid-session switch.** The TUI's `/team <id>` persists the new default via `setDefaultTeam` and instructs the user to restart; mid-session swaps are not supported in v1 (per ADR 26).
- **Team-swap body destruction.** Banned long before v1 — bodies do not stop on view-switch.
