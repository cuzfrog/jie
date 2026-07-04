# ADR 13: Platform Entry Function (No Supervisor)

## Status

Accepted. Replaces the implicit "supervisor" concept referenced throughout the spec with an explicit `startJie(opts): JieHandle` entry function.

## Context

The spec uses the term "supervisor" in several places (`08-memory.md`, `09-deployment.md`, ADR 11, and the previously-existing ADR 13 — AgentBody Runtime Mechanisms). The term is never defined as a TypeScript class or a specific module. It is used as a noun for "the thing that owns lifecycle", but the spec is ambiguous about whether that thing is a class, a function, or just a hand-wavy concept.

This ambiguity has implementation cost:

- A developer reading the spec has to guess where to put the `Map<agent_key, session_id>`.
- The `Map<agent_key, AgentBody>` is implied (lifecycle) but not stated.
- Team swap's "supervisor's in-memory map" lookup is a method on something, but `08-memory.md` doesn't say which module owns it.

A pre-implementation review surfaced that the natural shape is **a single exported function** with a small return-handle object — not a class, not a multi-method controller. The function does the start sequence; the handle exposes the lifecycle methods that the spec already names.

## Decision

The platform's entry point is a single function in `packages/jie-platform/start.ts`. The function takes the workspace-level options plus a `JiePlatformDeps` bundle for the runtime services (storage, registries, memory). The CLI constructs the bundle from `cwd` and `homeJieDir`; tests construct it with a `:memory:` storage.

```typescript
export interface JiePlatformOptions {
  cwd:           string;            // process.cwd()
  homeJieDir:    string;            // e.g. ~/.jie/
  projectJieDir: string | null;     // e.g. <cwd>/.jie, or null
  resumeSessionId?: string;         // --resume <id>; validated via memory.hasSession
}

export interface JiePlatformDeps {
  bus:           EventBus;        // caller-owned; the platform publishes on it
  storage:       Storage;         // pre-opened (with init-db applied)
  teamRegistry:  TeamRegistry;    // constructed from homeJieDir + projectJieDir
  modelRegistry: ModelRegistry;   // constructed from homeJieDir + projectJieDir
  toolRegistry:  ToolRegistry;    // tools available to bodies (notify, mcp stubs, ...)
  memoryManager: MemoryManager;   // session-lookup API; constructed from `storage`
  defaultScope:  "global" | "project"; // where the platform persists auto-corrected defaults
}

export interface JiePlatform {
  readonly teams:   ReadonlyMap<string, { id: string; agents: ReadonlyArray<AgentIdentity> }>;
  readonly settings: Settings;     // merged snapshot; CLI uses this to pick the team

  start:     () => Promise<void>;                                  // load all installed teams
  subscribe: <T extends EventType>(topic: T, callback: (env: EventEnvelope<T>) => void) => () => void;
  prompt:    (teamId: string, agentKey: string, text: string) => void;
  interrupt: () => void;
  execute:   <T extends CommandName>(command: Command<T>) => Promise<CommandResult<T>>;
  stop:      (timeoutMs?: number) => Promise<void>;
}

export function createJiePlatform(
  opts: JiePlatformOptions,
  deps: JiePlatformDeps,
): Promise<JiePlatform>;
```

The function is re-exported under the older public name for backward compatibility: `startJie` is an alias for `createJiePlatform`, and `JieHandle` is an alias for `JiePlatform`. New code should use `createJiePlatform` / `JiePlatform`; existing code that imports `startJie` / `JieHandle` continues to work.

`createJiePlatform` is `async` and does the platform's *non-team* initialization: it constructs the deps bundle (settings store, storage, model / tool registries, memory manager, team manager, command executor) and registers the caller-built event manager. The returned handle has `teams` empty and `settings` populated. The actual team-loading happens in `handle.start()`, which delegates to `TeamManager.loadAll()`. This split lets the CLI / TUI subscribe to events before any team-load event is published.

The handle is intentionally minimal. All team-level state (teamId, the bodies, the per-body `is_leader` flag) is exposed via bus events — specifically `system.team.loaded` published once per loaded team during `start()`. Per-team load failures publish `system.error` with a `team '<id>' failed to load: <reason>` payload; the CLI subscribes to that and surfaces it as a warning. The CLI captures the team info from `handle.teams` (after `start()` resolves) in the orchestrator (`createApp`) and passes it to the prompt flow (`runPrint`); the TUI subscribes to the bus directly. This is the "TUI only sees eventBus" design from ADR 25.

`createJiePlatform` is `async` and does the platform's *non-team* initialization. The caller supplies the deps bundle; the platform wires the bus, constructs the registries, and returns the handle. Team-loading happens in `handle.start()`, which delegates to `TeamManager.loadAll()`.

The `TeamManager.loadAll()` flow inside `handle.start()`:

1. Iterate `teamRegistry.listInstalled()` (which always includes the built-in `"minimal"`).
2. For each id, call `loadImpl(id)`:
   - Parse the manifest via `teamRegistry.parseTeamManifest(id)` (throws `TEAM_NOT_FOUND`, `INVALID_TEAM_ID`, or parse errors).
   - Resolve `sessionId` (ADR 20): if `options.resumeSessionId` is set, validate via `memory.hasSession`; else mint a fresh ULID. `UNKNOWN_SESSION` here is re-thrown by `loadAll` (per ADR 20 — user's explicit `--resume <id>` validation must be loud).
   - For each `AgentSoul`, resolve the model — `soul.model !== ""` wins, else falls through to settings `defaultProvider` / `defaultModel` (ADR 10-configuration "Model Resolution"). Per-agent resolution failure emits `system.error` and the soul is skipped (an empty-soul team still loads).
   - Construct one `AgentBody` per successfully resolved soul (with `is_leader` from the loader's leader-identification rules).
   - `body.start()` for each body (4-step restore-and-start sequence from `06-agent-model.md` "AgentBody" `start()`).
   - Publish `system.team.loaded` with `{ teamId, agents: [{ role, agent_key, is_leader }, ...] }` (sorted alphabetically by role).
3. Aggregate success into `handle.teams`. Per-team failures (parse / model / no agents) publish `system.error` and continue with the next id.
4. Resolve `handle.start()` once all installed teams are visited.

`stop(timeoutMs)` (per `09-deployment.md` "Graceful Shutdown"):

1. Send abort to all in-flight operations across **all loaded teams** (per ADR 19; v1 has one team — the startup team): the body's `agent.abort()` propagates via the combined `AbortSignal`.
2. Bounded wait up to `timeoutMs` (default 10s) for all bodies to settle.
3. On timeout: force-exit the process. On graceful: close `Storage`, terminate MCP subprocesses, return.

**Day 2+ multi-team**: the handle's public surface already exposes `teams: ReadonlyMap` and `settings`. The CLI picks the team (typically `args.teamId ?? handle.settings.defaultTeam ?? "minimal"`). There is no platform-side "active team" state — selection is a CLI concern (per ADR 24); the platform is read-only on the team dimension. Bodies keep running once `start()`ed; they are stopped via the handle's `stop()`. There is no Day-2 `loadTeam` call; the corresponding lifecycle was simplified away when the platform stopped tracking an active team.

The "supervisor" prose in the spec is rewritten to point at `JiePlatform` / `createJiePlatform` — no separate `Supervisor` class. The in-memory `Map<team_id, session_id>` is a private field of `createJiePlatform` (a closure); it is lost on process exit, matching the existing spec.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** The supervisor is a sequence of effects, not a stateful object the rest of the code talks to. Modeling it as a function makes the startup sequence explicit and the lifecycle handle a small, plain object.
- **No class means no false promises.** A `Supervisor` class invites subclassing, multi-method dispatch, dependency injection, and other ceremony that the spec does not need. A function with a handle object is the simplest thing that satisfies the spec's lifecycle requirements.
- **The handle is the natural place for the `Map<team_id, session_id>`.** Team load needs to look up a team's prior session; that lookup is a method on the handle (`handle.loadTeam`, Day 2+). Putting the map on the handle (as a private field) makes the lifetime obvious (it dies with the handle) and the load logic self-contained.
- **"Supervisor" was a placeholder name for a concept that did not have a clear shape.** Renaming to `createJiePlatform` + `JiePlatform` aligns the code, the spec, and the natural-language prose.
- **Aligns with `09-deployment.md`'s "Startup Sequence" steps.** The function is the executable form of those steps. The handle is what the steps leave behind.

## Consequences

- `packages/jie-platform/team/team-manager.ts` exposes `loadAll()` (replacing the previous `precheck()`). `loadAll` is the loop that was inline in `createJiePlatform`; the platform now delegates to it.
- `packages/jie-platform/start.ts` exports `createJiePlatform` (and the public alias `startJie`), `JiePlatform` (and the public alias `JieHandle`), and `JiePlatformDeps`. The CLI's `jie -p` entry constructs a `JiePlatformDeps` bundle and calls `startJie` with it. After construction, the CLI / TUI subscribes to events and awaits `handle.start()`. `JiePlatformDeps` is not re-exported from `@cuzfrog/jie-platform`'s public surface (the platform's `index.ts` is sealed); consumers construct the bundle and TypeScript infers the type from the function signature.
- The "supervisor" prose in `08-memory.md` and `09-deployment.md` is rewritten to refer to `JieHandle` / `JiePlatform`.
- The CLI's startup is a function call, not a class instantiation. The CLI does not import a `Supervisor` symbol.
- The "force-publishing on behalf of crashed agents" semantics (backlog, Day 2) is implemented on `JiePlatform` when the day comes, not on a separate supervisor class.
- The spec's TUI-facing `roles: string[]` parameter is the **startup team's** roles, sourced by the TUI from the `team.loaded` event's `agents[].role` field (each entry also carries `is_leader: boolean`). The CLI's `createApp` orchestrator subscribes to the event before `createJiePlatform` returns and captures the team info (`teamId`, `leaderRole`, `leaderKey`); the orchestrator passes these to `runPrint`. The TUI subscribes to the bus directly and derives all state from the event stream. The platform's `JiePlatform` interface is `{ bus, stop }` — the team info is not exposed on the handle (ADR 25's "TUI only sees eventBus" rule).
- Empty-team guard: when a team has no agents (or no leader), `team.loaded` is published with an empty `agents` array. The CLI's `createApp` orchestrator detects this and exits 1 with `team '<id>' has no agents to run; check the team manifest`; the gate is never entered. See `ui/cli.md` `jie -p` step 5.
