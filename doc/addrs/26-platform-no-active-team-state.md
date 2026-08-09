# ADR 26: Platform Has No Active-Team State; CLI / TUI Pick the Team

## Status

Accepted. `JiePlatform` does not own an "active team" closure and exposes no `setActiveTeam` / `loadTeam` / `bodies()` surface. Team loading happens through the `team` command; selection is a consumer concern (CLI resolves the id from argv + settings; TUI keeps a `focused` reducer state). This supersedes the earlier sketch that put `loadTeam` / `bodies()` / `teamId` on the handle. Per ADR 36 the handle lives at `src/platform/jie-platform.ts`.

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

Load via `execute({ name: "team" })`. `stop` halts everything.

Selection stays in CLI (`args.team`) / TUI (`focused` reducer).

Prompt/interrupt take explicit `teamId`; event bus disambiguates.

## Rationale
Selection belongs to consumer; handle stays minimal.

## Consequences

- Team loading is a platform command (`execute({ name: "team" })`); selection stays in CLI/TUI.
- ADR 24's discovery responsibility is unchanged.
