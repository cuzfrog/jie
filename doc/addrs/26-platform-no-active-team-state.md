# ADR 26: Platform Has No Active-Team State; CLI / TUI Pick the Team

## Status

Accepted. `JiePlatform` does not own an "active team" closure and exposes no `setActiveTeam` / `loadTeam` / `bodies()` surface. Team loading happens through the `team` command; selection is a consumer concern (CLI resolves the id from argv + settings; TUI keeps a `focused` reducer state). This supersedes the earlier sketch that put `loadTeam` / `bodies()` / `teamId` on the handle.

## Context

An earlier multi-team sketch put `loadTeam`, `bodies()`, and a `teamId` getter on the handle so the TUI could hot-swap teams. It conflated two distinct concerns: domain lifecycle (when does the platform construct bodies for a team?) and view-selection (which team's stream is the user looking at?). The second was never the platform's to begin with, and the first reduces to a command.

## Decision

### 1. `JiePlatform` does not track an active team

The public interface (ADR 13 has the full entry-function context):

```typescript
interface JiePlatform {
  readonly settings: Settings;
  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(teamId: string, agentKey: string): void;
  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
  teams(): ReadonlyArray<TeamInfo>;  // visibleForTesting
}
```

There is no `teamId` getter, no `loadTeam` method, no `bodies()` accessor, no `setActiveTeam` command. `teams()` exposes the loaded teams for tests only; consumers do not browse it.

### 2. Teams load through the `team` command

`execute({ name: "team", teamId? })` delegates to `TeamManager.load`: it resolves the id (`teamId ?? settings.defaultTeam ?? "minimal"`), parses the manifest, resolves session and models, starts bodies, and publishes `system.team.loaded` with the roster. Loaded teams stay loaded (their bodies keep running); `execute({ name: "stop" })` halts everything. The platform tracks loaded teams internally — but never "which one is active".

### 3. CLI / TUI pick the team from their own context

The CLI passes `args.team` (possibly undefined) to the `team` command and gets back the loaded `TeamInfo`; the print flow addresses the team's leader. The TUI's `/team <id>` calls `setDefaultTeam` (persisting via `settingsStore.write`); the change takes effect on the **next** process run, and the TUI's `focused` state names which team's stream the user is looking at — the TUI's reducer governs that, not the platform.

### 4. `prompt(teamId, agentKey, text)` makes selection explicit

The prompt entrypoint takes `teamId` as the first argument (so does `interrupt`). The platform does not need to "know which team is active" to forward the prompt — the caller says so. Multiple teams' bodies coexist on the same event bus, disambiguated by `teamId` in payloads and senders; switching the TUI's view does not stop or restart anything.

## Rationale

- **Selection belongs to the consumer.** The CLI knows the user's argv (`--team <id>`); the TUI knows the focused agent. A platform-side active team would be a third source of truth all consumers have to reconcile.
- **Loading is cheap, so a command suffices.** Parsing a `TEAM.md` + a handful of role files is millisecond-scale; there is no "too expensive until needed" pressure that would justify handle-level lifecycle methods.
- **The handle stays minimal.** Five members, nothing more; new operations land as commands, not handle methods (ADR 13).
- **Restart-to-switch is acceptable.** Single-process-per-conversation in v1; the TUI's local `focused` state is sufficient for view switches.

## Consequences

- `packages/jie-platform/jie-platform.ts` — the interface above, nothing more.
- `packages/jie-platform/team/team-manager.ts` — `load(teamId?)` resolves, parses, and starts; `listLoaded()` backs the test-only `teams()`.
- `packages/jie-cli/index.ts` — the print and TUI flows execute the `team` command with the requested id; no selection round-trip beyond that.
- ADR 24 — the platform's team-discovery responsibility (installed / locate / list) is unchanged; command-driven loading is the consumer of that discovery.
