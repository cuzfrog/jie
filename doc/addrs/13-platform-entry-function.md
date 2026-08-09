# ADR 13: Platform Entry Function (No Supervisor)

## Status

Accepted. The platform's entry point is the boot function in the platform module; there is no `Supervisor` class — "supervisor" was a spec placeholder for "the thing that owns lifecycle", now an explicit function plus a small handle object. The "no class, no DI" rationale below is superseded by ADR 31 (dependency injection via awilix): the entry function survives as `bootPlatform(options): AwilixContainer<PlatformCradle>`, same role, container-shaped result.

## Decision

The entry-point interface lives in `src/platform/jie-platform.ts`. It is a minimal handle (settings, prompt/interrupt, event subscription, command execution, test-only team list) returned by the boot function. Callers pass only options; tests inject dependency bundles.
The handle is intentionally minimal:

- **Lifecycle is commands, not handle methods.** `execute({ name: "team", teamId? })` loads the selected team through `TeamManager.load` (resolving the id when omitted) and returns its `TeamInfo`; `execute({ name: "stop" })` stops all loaded bodies. There is no `start()` / `stop()` on the handle.
- **All team-level state flows as events.** `system.team.loaded` is published once per loaded team; per-agent transitions flow as `agent.*` topics. The TUI derives everything from the event stream (ADR 25).
- **Selection is a consumer concern.** `prompt` and `interrupt` take `teamId` explicitly; the platform tracks no active team (ADR 26). The CLI resolves `args.teamId ?? settings.defaultTeam ?? "default-solo"` and passes it.
- **The in-memory `Map<team_id, session_id>` is a private closure field** of the platform construction (ADR 17), not part of the interface; it is lost on process exit.
- Team load failures (missing/invalid manifest, unknown `--resume` session) throw `JiePlatformError`; the CLI prints the message and exits 1. A non-leader soul whose model cannot be resolved is skipped silently, but an unresolvable leader model throws `MODEL_UNRESOLVED` and fails the load — the platform always keeps the leader. `system.error` is the agent-loop error channel (tool/turn failures); the CLI subscribes and prints it as a warning.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** Startup is a sequence of effects, not a stateful object the rest of the code talks to. A function with a plain handle makes the startup sequence explicit.
- **No class means no false promises.** A `Supervisor` class invites subclassing, dispatch ceremony, and DI the platform does not need.
- **Commands keep the surface closed.** New operations (auth, settings, session listing, git status, shutdown) land as `CommandName` entries in the executor, not as new handle methods — the `JiePlatform` interface stays at the minimum the CLI and TUI consume.

## Consequences

- The CLI's `bootPlatform` awaits `createJiePlatform(options)`, subscribes to `system.error`, then dispatches per subcommand (`jie -p` executes the `team` command and runs the print flow; the TUI executes `team` then `stop` on exit). The CLI never imports a supervisor symbol.
- `JiePlatformDeps` is not re-exported from the package's public surface (no-new-exports); tests construct the bundle and TypeScript infers the type from the function signature.
