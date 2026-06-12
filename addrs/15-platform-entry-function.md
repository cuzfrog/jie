# ADR 15: Platform Entry Function (No Supervisor)

## Status

Accepted. Replaces the implicit "supervisor" concept referenced throughout the spec with an explicit `startJie(opts): JieHandle` entry function.

## Context

The spec uses the term "supervisor" in several places:

- `08-memory.md` — "the supervisor's in-memory `Map<agent_key, session_id>`", "the supervisor maintains an in-memory map…"
- `09-deployment.md` — "The supervisor does not auto-reconnect mid-session"
- `13-agentbody-runtime-mechanisms.md` — "the per-body `agent.idle` provides the live state" (referring to supervisor)
- `addrs/12-jie-platform-agnostic-of-jie-team.md` — "The supervisor's `Map<agent_key, session_id>`"

The term is never defined as a TypeScript class or a specific module. It is used as a noun for "the thing that owns lifecycle", but the spec is ambiguous about whether that thing is a class, a function, or just a hand-wavy concept.

This ambiguity has implementation cost:

- A developer reading the spec has to guess where to put the `Map<agent_key, session_id>`.
- The `Map<agent_key, AgentBody>` is implied (lifecycle) but not stated.
- Team swap's "supervisor's in-memory map" lookup is a method on something, but `08-memory.md` doesn't say which module owns it.
- The "supervisor" / "supervisor force-publishes on behalf of crashed agents" wording (backlog #17) is too abstract to anchor an implementation.

A pre-implementation review surfaced that the natural shape is **a single exported function** with a small return-handle object — not a class, not a multi-method controller. The function does the start sequence; the handle exposes the lifecycle methods that the spec already names.

## Decision

The platform's entry point is a single function in `packages/jie-platform/start.ts`:

```typescript
export interface StartJieOptions {
  workspace:   string;            // process.cwd()
  settings:    MergedSettings;    // resolved from .jie/ + ~/.jie/
  storage:     Storage;           // pre-opened (with init-db applied)
  teamId:      string | "minimal";// resolved team
  mcpServers:  McpServerConfig[]; // from .jie/mcp.json (Day 2 — not loaded in v1 per ADR 17)
  resumeSessionId?: string;       // --resume
  onIdle?:     () => void;        // -p mode hook
}

export interface JieHandle {
  bus:           EventBus;
  artifacts:     ArtifactStore;
  memoryFor:     (agentKey: string) => MemoryManager;
  bodyFor:       (agentKey: string) => AgentBody | undefined;
  bodies:        () => AgentBody[];
  swapTeam:      (teamId: string) => Promise<void>;
  waitForIdle:   (timeoutMs?: number) => Promise<void>;
  stop:          (timeoutMs?: number) => Promise<void>; // bounded graceful shutdown
}

export function startJie(opts: StartJieOptions): JieHandle;
```

`startJie` does the full startup sequence from `09-deployment.md` "Startup Sequence" steps 5–9 (storage is already open by the caller; the function does not own DB lifecycle):

1. Connect MCP servers (per-server failures log WARN and skip; tools registered into a `ToolRegistry`).
2. Resolve the team: load the manifest from the team-blueprint loader; resolve each `AgentSoul.model` against merged settings; build the `AgentSoul[]`.
3. Construct one `MemoryManager` per agent (sharing the `Storage`).
4. Instantiate one `AgentBody` per agent (closed-over with `AgentSoul`, the `EventBus`, the `ArtifactStore`, the per-body `MemoryManager`).
5. Call `body.start()` on each body — this registers subscriptions, publishes the startup `agent.idle`, and begins the message queue (per ADR 13).
6. Return a `JieHandle` with the lifecycle methods.

`stop(timeoutMs)` (per `09-deployment.md` "Graceful Shutdown"):

1. Send abort to all in-flight operations (the body's `agent.abort()` propagates via the combined `AbortSignal` per ADR 9).
2. Bounded wait up to `timeoutMs` (default 10s) for bodies to settle.
3. On timeout: force-exit the process. On graceful: close `Storage`, terminate MCP subprocesses, return.

`swapTeam(teamId)` (per `ui/tui.md` "Team Swap" and `10-configuration.md` "Team Swap"):

1. `stop()` (bounded 10s).
2. Re-resolve team (per `10-configuration.md` "Team Selection" rules).
3. For each new body's `agent_key`, look up the prior `session_id` in an in-memory `Map<agent_key, session_id>` kept on the `JieHandle`. Pass it to the new body so `memory.restore()` returns prior rows. New `agent_key`s get a fresh `session_id` and the mapping is recorded.
4. Re-run the body-instantiation + `start()` sequence.
5. Resolve when new bodies are subscribed and idle.

The "supervisor" prose in the spec is rewritten to point at `JieHandle` / `startJie` — no separate `Supervisor` class. The in-memory `Map<agent_key, session_id>` is a private field on the handle (or a closure inside `startJie`); it is lost on process exit, matching the existing spec.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** The supervisor is a sequence of effects, not a stateful object the rest of the code talks to. Modeling it as a function makes the startup sequence explicit and the lifecycle handle a small, plain object.
- **No class means no false promises.** A `Supervisor` class invites subclassing, multi-method dispatch, dependency injection, and other ceremony that the spec does not need. A function with a handle object is the simplest thing that satisfies the spec's lifecycle requirements.
- **The handle is the natural place for the `Map<agent_key, session_id>`.** Team swap needs to look up a body's prior session; that lookup is a method on the handle (`handle.swapTeam`). Putting the map on the handle makes the lifetime obvious (it dies with the handle) and the swap logic self-contained.
- **"Supervisor" was a placeholder name for a concept that did not have a clear shape.** Renaming to `startJie` + `JieHandle` aligns the code, the spec, and the natural-language prose. The next time someone reads "the supervisor's map", the spec will say "the handle's session map", and the implementation will match.
- **Aligns with `09-deployment.md`'s "Startup Sequence" steps.** The function is the executable form of those steps. The handle is what the steps leave behind.

## Consequences

- `packages/jie-platform/start.ts` exports `startJie` and `JieHandle`. The CLI's `jie` / `jie -p` entry calls `startJie` with resolved options.
- `addrs/12-jie-platform-agnostic-of-jie-team.md` "Consequences" still references "the supervisor's `Map<agent_key, session_id>`"; this is updated to "the handle's session map" (or equivalent).
- `08-memory.md` "Supervisor's `Map<agent_key, session_id>`" prose is updated to refer to `JieHandle`'s private map; the semantics (in-memory, lost on exit, recorded on first body construction) are unchanged.
- `09-deployment.md` "The supervisor does not auto-reconnect mid-session" is updated to "The handle does not auto-reconnect mid-session" (or "The platform does not…").
- `addrs/13-agentbody-runtime-mechanisms.md` "supervisor (which loaded the blueprint)" is updated to "the startJie entry, which loaded the blueprint".
- The CLI's startup is `new JieHandle`-equivalent — i.e. a function call, not a class instantiation. The CLI does not import a `Supervisor` symbol.
- The "force-publishing on behalf of crashed agents" semantics (backlog #17, Day 2) is implemented on `JieHandle` when the day comes, not on a separate supervisor class.
- The spec's TUI-facing `roles: string[]` parameter (per ADR 13 / J7) is read by the TUI from the team-blueprint loader's output, **before** `startJie` is called (or by the CLI after `startJie` returns and before passing to the TUI). The handle does not own `roles`.
