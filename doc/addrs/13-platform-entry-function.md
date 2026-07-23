# ADR 13: Platform Entry Function (No Supervisor)

## Status

Accepted. The platform's entry point is `createJiePlatform` in `packages/jie-platform/jie-platform.ts`; there is no `Supervisor` class — "supervisor" was a spec placeholder for "the thing that owns lifecycle", now an explicit function plus a small handle object. The "no class, no DI" rationale below is superseded by ADR 31 (dependency injection via awilix): the entry function survives as `bootPlatform(options): AwilixContainer<PlatformCradle>`, same role, container-shaped result.

## Decision

```typescript
export interface JiePlatformOptions {
  readonly cwd: string;            // process.cwd()
  readonly homeJieDir: string;     // e.g. ~/.jie/
  readonly projectJieDir: string | null;  // e.g. <cwd>/.jie, or null
  readonly resumeSessionId?: string;      // --resume <id>; validated via memory.hasSession (ADR 17)
  readonly inMemory?: boolean;            // :memory: storage (tests, throwaway runs)
}

export interface JiePlatform {
  readonly settings: Settings;            // merged snapshot; consumers use it to pick the team

  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(teamId: string, agentKey: string): void;

  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
  teams(): ReadonlyArray<TeamInfo>;       // visibleForTesting
}

export async function createJiePlatform(
  options: JiePlatformOptions,
  deps: JiePlatformDeps = buildJiePlatformDeps(options),
): Promise<JiePlatform>;
```

`createJiePlatform` wires the runtime (event manager, settings/auth stores, storage, model and tool registries, memory manager, artifact store, team manager, command executor) and returns the handle. Callers normally pass only `options`; tests supply a `JiePlatformDeps` bundle with `:memory:` storage.

The handle is intentionally minimal:

- **Lifecycle is commands, not handle methods.** `execute({ name: "team", teamId? })` loads the selected team through `TeamManager.load` (resolving the id when omitted) and returns its `TeamInfo`; `execute({ name: "stop" })` stops all loaded bodies. There is no `start()` / `stop()` on the handle.
- **All team-level state flows as events.** `system.team.loaded` is published once per loaded team; per-agent transitions flow as `agent.*` topics. The TUI derives everything from the event stream (ADR 25).
- **Selection is a consumer concern.** `prompt` and `interrupt` take `teamId` explicitly; the platform tracks no active team (ADR 26). The CLI resolves `args.teamId ?? settings.defaultTeam ?? "minimal"` and passes it.
- **The in-memory `Map<team_id, session_id>` is a private closure field** of the platform construction (ADR 17), not part of the interface; it is lost on process exit.
- Team load failures (missing/invalid manifest, unknown `--resume` session) throw `JiePlatformError`; the CLI prints the message and exits 1. Souls whose model cannot resolve are skipped silently — a team with no loadable agents is a consumer-side guard. `system.error` is the agent-loop error channel (tool/turn failures); the CLI subscribes and prints it as a warning.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** Startup is a sequence of effects, not a stateful object the rest of the code talks to. A function with a plain handle makes the startup sequence explicit.
- **No class means no false promises.** A `Supervisor` class invites subclassing, dispatch ceremony, and DI the platform does not need.
- **Commands keep the surface closed.** New operations (auth, settings, session listing, git status, shutdown) land as `CommandName` entries in the executor, not as new handle methods — the `JiePlatform` interface stays at the minimum the CLI and TUI consume.

## Consequences

- The CLI's `bootPlatform` awaits `createJiePlatform(options)`, subscribes to `system.error`, then dispatches per subcommand (`jie -p` executes the `team` command and runs the print flow; the TUI executes `team` then `stop` on exit). The CLI never imports a supervisor symbol.
- `JiePlatformDeps` is not re-exported from the package's public surface (no-new-exports); tests construct the bundle and TypeScript infers the type from the function signature.
