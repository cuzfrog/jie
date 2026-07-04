# ADR 26: Platform Has No Active-Team State; CLI / TUI Pick the Team

## Status

Accepted. `JiePlatform` exposes the loaded teams as a read-only map and a merged settings snapshot, but does **not** own an "active team" closure or expose a `setActiveTeam` / `loadTeam` method. Selection is a consumer concern (CLI's `createApp`, TUI's focused-agent reducer state). This supersedes the Day 2+ sketch in ADR 19 that put `loadTeam` / `bodies()` / `teamId` on the handle.

## Context

ADR 13 put the v1 surface at `{ bus, stop }` and recorded a Day 2+ multi-team shape with `loadTeam`, `bodies()`, and `teamId` on the handle. After the stage-3 redesign and the /code-improve "drop activeTeamId concern from jie-platform" review, the platform no longer hosts any "current" team at all:

- The platform eagerly loads every installed team at startup (per ADR 24 + the `createJiePlatform` flow), publishes `system.team.loaded` per loaded team, and stores the parsed `TeamIdentity` map on the handle's public `teams` field.
- The platform also exposes `settings: Settings` (the merged snapshot). Consumers resolve the default team via `args.teamId ?? handle.settings.defaultTeam ?? "minimal"`.
- The CLI's `createApp` picks the team from `handle.teams` + the resolved id, computes a leader, and passes the result to `runPrint`. The TUI's `focused` reducer state is the TUI's runtime analog; it is the TUI's concern, not the platform's.
- The `--team <id>` flag sets the persisted `settings.defaultTeam` (so a future process run lands on the same team); `/team <id>` in the TUI does the same. Neither path mutates platform-side state.

The previous sketch ("the platform owns `loadTeam` so the TUI can hot-load a second team") conflated two distinct concerns: domain lifecycle (when does the platform parse and construct bodies for a team?) and view-selection (which team's stream is the user looking at?). Eager loading at startup removes the first concern from the critical path; the second concern was never the platform's to begin with.

## Decision

### 1. `JiePlatform` does not track an active team

The public interface (note: `teams` is populated by `start()`, not by `createJiePlatform`):

```typescript
interface JiePlatform {
  readonly teams:   ReadonlyMap<string, TeamIdentity>;
  readonly settings: Settings;
  start(): Promise<void>;       // triggers TeamManager.loadAll()
  stop(): Promise<void>;
  subscribe<T extends EventType>(topic: T, callback: (env: EventEnvelope<T>) => void): () => void;
  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(): void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}
```

There is no `teamId` getter, no `loadTeam` method, no `bodies()` accessor, no `setActiveTeam` command. `createJiePlatform` returns a handle with empty `teams` and populated `settings`; the CLI / TUI subscribes to events, then awaits `handle.start()` to populate `teams`.

### 2. The platform loads every installed team at startup

`createJiePlatform` iterates `deps.teamManager.listInstalled()`, calls `deps.teamManager.load(id)` for each, and inserts the resulting `TeamIdentity` into `handle.teams`. Teams whose manifest fails to parse or whose soul model cannot resolve are silently omitted (per ADR 13 step 6). The platform does not stop bodies — `stop()` is the single lifecycle primitive that halts everything.

### 3. CLI / TUI pick the team from the surface

The CLI's `createApp`:

```typescript
const requestedTeam = args.teamId ?? handle.settings.defaultTeam ?? "minimal";
const team = resolveTeam(handle.teams, requestedTeam);  // fallback to minimal if missing
const leader = pickLeader(team.agents);                 // find isLeader; else first
return { handle, teamId: team.id, leaderKey: leader.agentKey, ... };
```

`resolveTeam` falls back to the built-in minimal team if the requested id is missing; if even that is missing (e.g. corrupt manifest), exit 1. The CLI never asks the platform to "switch" teams — selection is done locally.

The TUI's `/team <id>` slash command calls `execute({ name: "setDefaultTeam", teamId })` (persisting the default via `settingsStore.write`); the change takes effect on the **next** process run. The TUI's `focused` state names which team's stream the user is looking at; the TUI's reducer governs that, not the platform.

### 4. `prompt(teamId, agentKey, text)` makes selection explicit

The prompt entrypoint takes `teamId` as the first argument. The platform does not need to "know which team is active" to forward the prompt — the caller says so. This eliminates the closing-over-an-active-team shape that would otherwise need a `loadActiveTeam` helper in the executor (and the `switchTeam` command that consumed it).

### 5. The Day 2+ sketch in ADR 19 is superseded

The `loadTeam` / `bodies()` / `teamId` sketch in ADR 19 is replaced by this ADR. The handle's v1 surface is final; adding lifecycle methods on top would re-introduce the coupling ADR 13's round-6 simplification removed.

## Rationale

- **Selection belongs to the consumer.** The CLI knows the user's argv (and therefore `--team <id>`); the TUI knows the user's focused agent. Both compute "what's the active team" locally and pass it explicitly. A platform-side active team would be a third source of truth that all consumers have to reconcile.
- **Eager loading is cheap.** Parsing a `TEAM.md` + a handful of `.md` files per team is a millisecond-scale cost; the platform does it once at startup for every installed team. There is no "second team is too expensive to load until needed" pressure that would justify on-demand `loadTeam`.
- **The handle stays minimal.** A `JiePlatform` interface with five methods and two readonly fields is easy to subscribe to (the TUI only needs `subscribe`, `prompt`, `execute`, `stop`); adding lifecycle methods grows it for no v1 caller.
- **Restart-to-switch is acceptable.** A user running `jie` and wanting to change teams via `/team <id>` will see the change on the next launch. v1 is single-process-per-conversation; the TUI (Day 2+) can keep the old team running for a swap-back but the platform-side state isn't needed for that — the TUI's local `focused` state and the platform's eager-loaded `teams` map are sufficient.

## Consequences

- `packages/jie-platform/jie-platform.ts` — `JiePlatform` interface contains `teams: ReadonlyMap` + `settings: Settings` plus the event / prompt / interrupt / execute / stop surface, nothing more.
- `packages/jie-platform/team/team-manager.ts` — `TeamManager.load(id): Promise<TeamIdentity>` returns the parsed identity; `listInstalled(): string[]` enumerates them. Eager loading at startup iterates the list and catches parse / model errors silently (per ADR 13).
- `packages/jie-cli/app.ts` — `createApp` resolves the team locally; no platform round-trip for selection.
- `packages/jie-cli/commands/settings.ts` — `setDefaultTeam` is the canonical command for `jie team <id>` and the TUI's `/team <id>`; it persists via `settingsStore.write`.
- `packages/jie-tui/command-handler.ts` — `/team <id>` dispatches `setDefaultTeam`; the reply is "default team set to '<id>'; restart jie to take effect".
- ADR 13 — `JiePlatform` shape reflects this ADR's interface; "active team" prose is removed.
- ADR 19 — Day 2+ sketch is superseded; this ADR is the new home for "no platform-side active team".
- ADR 24 — the platform's team-discovery responsibility is unchanged; eager loading is the eager of the existing discovery logic.
