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
export interface CreateJieOptions {
  workspace:   string;            // process.cwd()
  homeJieDir:  string;            // e.g. ~/.jie/
  settingsStore: SettingsStore;   // bound to (cwd, homeJieDir); platform calls .load()
  teamId:      string | "minimal";// resolved team
  mcpServerConfigs?: McpServerConfig[]; // forward-looking stub (not loaded in v1 per ADR 15)
  resumeSessionId?:     string;   // --resume <id>; validated via memory.hasSession
  continueLastSession?: boolean; // --continue; resolved via memory.mostRecentSessionId
}

export interface JiePlatformDeps {
  bus:           EventBus;        // caller-owned; the platform publishes on it
  storage:       Storage;         // pre-opened (with init-db applied)
  teamRegistry:  TeamRegistry;    // constructed from homeJieDir + projectJieDir
  modelRegistry: ModelRegistry;   // constructed from homeJieDir + projectJieDir
  toolRegistry:  ToolRegistry;    // tools available to bodies (notify, mcp stubs, ...)
  memoryManager: MemoryManager;   // session-lookup API; constructed from `storage`
}

export interface JiePlatform {
  bus:  EventBus;
  stop: (timeoutMs?: number) => Promise<void>;
}

export function createJiePlatform(
  opts: CreateJieOptions,
  deps: JiePlatformDeps,
): Promise<JiePlatform>;
```

The function is re-exported under the older public name for backward compatibility: `startJie` is an alias for `createJiePlatform`, and `JieHandle` is an alias for `JiePlatform`. New code should use `createJiePlatform` / `JiePlatform`; existing code that imports `startJie` / `JieHandle` continues to work.

The handle is intentionally minimal. All team-level state (teamId, the bodies, the per-body `is_leader` flag) is exposed via bus events — specifically `{team_id}.team.loaded` published once at startup. The CLI captures the team info from the bus in the orchestrator (`createApp`) and passes it to the prompt flow (`runPrint`); the TUI subscribes to the bus directly. This is the "TUI only sees eventBus" design from ADR 25.

`createJiePlatform` is `async` and does the full startup sequence. The caller supplies the `storage` (already open), the `teamRegistry`, the `modelRegistry`, the `toolRegistry`, and the `memory` manager. The platform uses `storage` for the `artifactStore` and for the `memory` manager's underlying connection; `teamRegistry` / `modelRegistry` / `toolRegistry` are used as-is.

1. Connect MCP servers (per-server failures log WARN and skip; tools registered into a `ToolRegistry`). Skipped in v1 per ADR 15.
2. Resolve the team: load the manifest from the team-blueprint loader; resolve each `AgentSoul.model` against merged settings; build the `AgentSoul[]`.
3. Construct one `MemoryManager` from the open `Storage` (per ADR 12). Resolve the startup team's `session_id` per ADR 20: validate `resumeSessionId` via `memory.hasSession` (exit 1 on failure with `unknown session_id: <value>`); query `mostRecentSessionId` for `continueLastSession` (WARN and mint fresh on null); else mint fresh (ULID). Record the resolved value in the handle's `Map<team_id, session_id>`.
4. Instantiate one `AgentBody` per agent. The body constructor takes the `AgentSoul` from step 2, the `EventBus`, the `ArtifactStore`, the **shared** `MemoryManager` constructed in step 3 (all bodies share one `MemoryManager` instance; per-body disambiguation is via the `agent_key` / `session_id` / `team_id` arguments to `restore` / `persist` / `compact`), the `session_id` resolved in step 3, the body's `agent_key` ({role}-1 in v1; the loader's `roles` output is sorted alphabetically by role, so the loader's order determines which body is "1"), the resolved `team_id`, and an `is_leader: boolean` set by the loader per the rules in `06-agent-model.md` "Platform Auto-Wiring" (multi-agent teams with `TEAM.md`: `true` for the `leader:` role, `false` for others; single-agent teams without `TEAM.md`: `true` for the single body by implicit-leader rule; etc.). `is_leader` is a constructor parameter, not an `AgentSoul` field — the soul is the role's behavioral profile; team-level leader identification is owned by the loader.
5. Call `body.start()` on each body (async). `body.start()` runs the four-step restore-and-start sequence documented in `06-agent-model.md` "AgentBody" `start()`: (1) register bus subscriptions, (2) `memory.restore()` and push to `agent.state.messages`, (3) if last message is `user`/`toolResult`, `agent.continue()`, (4) start the queue-processing loop. The handle `await`s every body's `start()` before proceeding. The body does **not** publish `agent.idle` at startup (per ADR 22).
6. Publish `{team_id}.team.loaded` for the startup team, with payload `{ team_id, agents: [{ role, agent_key }, ...] }` (sorted alphabetically by role, consistent with the loader's output). This is the one-shot "team is loaded" signal for observers (TUI agents-panel).
7. Return a `JiePlatform` with the lifecycle methods (v1: `bus`, `stop`; Day 2+ multi-team: `loadTeam`, `bodies()`, `teamId` per ADR 19).

`stop(timeoutMs)` (per `09-deployment.md` "Graceful Shutdown"):

1. Send abort to all in-flight operations across **all loaded teams** (per ADR 19; v1 has one team — the startup team): the body's `agent.abort()` propagates via the combined `AbortSignal`.
2. Bounded wait up to `timeoutMs` (default 10s) for all bodies to settle.
3. On timeout: force-exit the process. On graceful: close `Storage`, terminate MCP subprocesses, return.

**Day 2+ lifecycle-changing call: `loadTeam(teamId)`** (per `ui/tui.md` "Team" and ADR 19). v1 does not ship this method — the platform only loads the startup team, and the handle's public surface is `{ bus, stop }`. The Day 2+ design:

1. If the team is already in `loadedTeams`, return immediately. The previously-active team is not stopped or destroyed — it keeps running with its state intact.
2. If the team is not loaded, parse the blueprint per `10-configuration.md` "Team Selection" rules; resolve each `AgentSoul.model`; construct bodies (with `is_leader` per the loader's leader identification); call `body.start()` on each.
3. The platform's private `Map<team_id, session_id>` (per ADR 18) supplies the prior `session_id` for the new team if it was previously active in this process; otherwise the platform mints a fresh `session_id` (ULID via `ulid@2.3.0`) and records it. The session id is passed to each new body; `memory.restore()` returns prior rows where applicable.
4. Publish `{team_id}.team.loaded` for the newly-loaded team (same shape as `createJiePlatform` step 6). This is the one-shot "team is loaded" signal for observers. The event is **not** republished on subsequent team swap-backs to the same team; observers that came back to it use the buffer / cache they already built up.
5. Resolve when new bodies are subscribed.

The TUI's view switch is a separate concern: the TUI calls `loadTeam(teamId)` (idempotent) and then re-renders to subscribe to the new team's `leader.prompt` and filter platform events by the new `team_id`. There is no `swapTeam` on the handle — the "swap" semantic is the TUI's view change, not a body-lifecycle change.

The "supervisor" prose in the spec is rewritten to point at `JiePlatform` / `createJiePlatform` — no separate `Supervisor` class. The in-memory `Map<team_id, session_id>` is a private field of `createJiePlatform` (a closure); it is lost on process exit, matching the existing spec.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** The supervisor is a sequence of effects, not a stateful object the rest of the code talks to. Modeling it as a function makes the startup sequence explicit and the lifecycle handle a small, plain object.
- **No class means no false promises.** A `Supervisor` class invites subclassing, multi-method dispatch, dependency injection, and other ceremony that the spec does not need. A function with a handle object is the simplest thing that satisfies the spec's lifecycle requirements.
- **The handle is the natural place for the `Map<team_id, session_id>`.** Team load needs to look up a team's prior session; that lookup is a method on the handle (`handle.loadTeam`, Day 2+). Putting the map on the handle (as a private field) makes the lifetime obvious (it dies with the handle) and the load logic self-contained.
- **"Supervisor" was a placeholder name for a concept that did not have a clear shape.** Renaming to `createJiePlatform` + `JiePlatform` aligns the code, the spec, and the natural-language prose.
- **Aligns with `09-deployment.md`'s "Startup Sequence" steps.** The function is the executable form of those steps. The handle is what the steps leave behind.

## Consequences

- `packages/jie-platform/start.ts` exports `createJiePlatform` (and the public alias `startJie`), `JiePlatform` (and the public alias `JieHandle`), and `JiePlatformDeps`. The CLI's `jie -p` entry constructs a `JiePlatformDeps` bundle and calls `startJie` with it. `JiePlatformDeps` is not re-exported from `@cuzfrog/jie-platform`'s public surface (the platform's `index.ts` is frozen); consumers construct the bundle and TypeScript infers the type from the function signature.
- The "supervisor" prose in `08-memory.md` and `09-deployment.md` is rewritten to refer to `JieHandle` / `JiePlatform`.
- The CLI's startup is a function call, not a class instantiation. The CLI does not import a `Supervisor` symbol.
- The "force-publishing on behalf of crashed agents" semantics (backlog, Day 2) is implemented on `JiePlatform` when the day comes, not on a separate supervisor class.
- The spec's TUI-facing `roles: string[]` parameter is the **startup team's** roles, sourced by the TUI from the `team.loaded` event's `agents[].role` field (each entry also carries `is_leader: boolean`). The CLI's `createApp` orchestrator subscribes to the event before `createJiePlatform` returns and captures the team info (`teamId`, `leaderRole`, `leaderKey`); the orchestrator passes these to `runPrint`. The TUI subscribes to the bus directly and derives all state from the event stream. The platform's `JiePlatform` interface is `{ bus, stop }` — the team info is not exposed on the handle (ADR 25's "TUI only sees eventBus" rule).
- Empty-team guard: when a team has no agents (or no leader), `team.loaded` is published with an empty `agents` array. The CLI's `createApp` orchestrator detects this and exits 1 with `team '<id>' has no agents to run; check the team manifest`; the gate is never entered. See `ui/cli.md` `jie -p` step 5.
