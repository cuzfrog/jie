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
  resumeSessionId?:     string;   // --resume <id>; validated by startJie via memory.hasSession
  continueLastSession?: boolean; // --continue; resolved by startJie via memory.mostRecentSessionId
}

export interface JieHandle {
  bus:           EventBus;
  artifacts:     ArtifactStore;
  bodies:        () => AgentBody[];
  bodiesFor:     (teamId: string) => AgentBody[];     // empty if not loaded
  rolesFor:      (teamId: string) => string[];        // role stems of the loaded team; empty if not loaded
  loadTeam:      (teamId: string) => Promise<void>;   // ensure-loaded; idempotent if already loaded; previously-active team keeps running (ADR 21); publishes {team_id}.team.loaded for the new team
  stop:          (timeoutMs?: number) => Promise<void>; // bounded graceful shutdown; stops all loaded teams
}

export function startJie(opts: StartJieOptions): JieHandle;
```

`startJie` does the full startup sequence from `09-deployment.md` "Startup Sequence" steps 5–9 (storage is already open by the caller; the function does not own DB lifecycle):

1. Connect MCP servers (per-server failures log WARN and skip; tools registered into a `ToolRegistry`).
2. Resolve the team: load the manifest from the team-blueprint loader; resolve each `AgentSoul.model` against merged settings; build the `AgentSoul[]`.
3. Construct one `MemoryManager` (per ADR 14's `SqliteMemoryManager`) from the open `Storage`. Resolve the startup team's `session_id` per ADR 22: validate `resumeSessionId` via `memory.hasSession` (exit 1 on failure with `unknown session_id: <value>`); query `mostRecentSessionId` for `continueLastSession` (WARN and mint fresh on null); else mint fresh (ULID). Record the resolved value in the handle's `Map<team_id, session_id>` (per ADR 20).
4. Instantiate one `AgentBody` per agent (closed-over with `AgentSoul`, the `EventBus`, the `ArtifactStore`, the per-body `MemoryManager`, and the `session_id` resolved in step 3).
5. Call `body.start()` on each body — this registers subscriptions and begins the message queue. The body does **not** publish `agent.idle` at startup (per ADR 24).
6. Publish `{team_id}.team.loaded` for the startup team, with payload `{ team_id, agents: [{ role, agent_key }, ...] }` (sorted alphabetically by role, consistent with the loader's output). This is the one-shot "team is loaded" signal for observers (TUI agents-panel).
7. Return a `JieHandle` with the lifecycle methods.

`stop(timeoutMs)` (per `09-deployment.md` "Graceful Shutdown"):

1. Send abort to all in-flight operations across **all loaded teams** (per ADR 21): the body's `agent.abort()` propagates via the combined `AbortSignal` per ADR 9.
2. Bounded wait up to `timeoutMs` (default 10s) for all bodies to settle.
3. On timeout: force-exit the process. On graceful: close `Storage`, terminate MCP subprocesses, return.

The lifecycle-changing call is `loadTeam(teamId)` (per `ui/tui.md` "Team" and ADR 21 multi-team coexistence):

1. If the team is already in `loadedTeams`, return immediately. The previously-active team is not stopped or destroyed — it keeps running with its state intact.
2. If the team is not loaded, parse the blueprint per `10-configuration.md` "Team Selection" rules; resolve each `AgentSoul.model`; construct bodies; call `body.start()` on each.
3. The `JieHandle`'s in-memory `Map<team_id, session_id>` (per ADR 20) supplies the prior `session_id` for the new team if it was previously active in this process; otherwise the handle mints a fresh `session_id` (ULID via `ulid@2.3.0`) and records it. The session id is passed to each new body; `memory.restore()` returns prior rows where applicable.
4. Publish `{team_id}.team.loaded` for the newly-loaded team (same shape as `startJie` step 6). This is the one-shot "team is loaded" signal for observers. The event is **not** republished on subsequent team swap-backs to the same team; observers that came back to it use the buffer / cache they already built up.
5. Resolve when new bodies are subscribed.

The TUI's view switch is a separate concern: the TUI calls `loadTeam(teamId)` (idempotent) and then re-renders to subscribe to the new team's `leader.prompt` and filter platform events by the new `team_id`. There is no `swapTeam` on the handle — the "swap" semantic is the TUI's view change, not a body-lifecycle change. (A previous version of this ADR added `swapTeam` to the handle as a wrapper around `loadTeam` plus "view switch"; fresh review pass 5 collapsed it back into `loadTeam` only, with the view switch owned by the TUI.)

The "supervisor" prose in the spec is rewritten to point at `JieHandle` / `startJie` — no separate `Supervisor` class. The in-memory `Map<team_id, session_id>` is a private field on the handle (or a closure inside `startJie`); it is lost on process exit, matching the existing spec.

## Rationale

- **A function is the right granularity for "the thing that starts the platform".** The supervisor is a sequence of effects, not a stateful object the rest of the code talks to. Modeling it as a function makes the startup sequence explicit and the lifecycle handle a small, plain object.
- **No class means no false promises.** A `Supervisor` class invites subclassing, multi-method dispatch, dependency injection, and other ceremony that the spec does not need. A function with a handle object is the simplest thing that satisfies the spec's lifecycle requirements.
- **The handle is the natural place for the `Map<agent_key, session_id>`.** Team load needs to look up a body's prior session; that lookup is a method on the handle (`handle.loadTeam`). Putting the map on the handle makes the lifetime obvious (it dies with the handle) and the load logic self-contained.
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
- The spec's TUI-facing `roles: string[]` parameter (per ADR 13 / J7) is the **startup team's** roles, sourced by the CLI from `handle.rolesFor(startupTeamId)` after `startJie` returns and before passing to the TUI. The handle is the single source of truth for "which roles are in which loaded team"; the CLI does not parse the team manifest separately before `startJie`. For any subsequently-loaded team (per ADR 21 multi-team coexistence), the TUI queries `handle.rolesFor(teamId)` at swap time. The handle owns roles *per loaded team* via the `loadedTeams` map; it does not own the full roster of installed teams (that's a `10-configuration.md` concern).

## Amendment history

- **2026-06-13 (ADR 22):** `StartJieOptions` gains `continueLastSession?: boolean`. `startJie` step 3 expanded: the platform constructs a `MemoryManager` from the open `Storage` and uses it to resolve `--continue` (via `mostRecentSessionId`) and validate `--resume` (via `hasSession`) before constructing bodies. The CLI no longer runs session-id SQL itself; it passes intent via `StartJieOptions` and `startJie` does the work.
- **2026-06-13 (Group 4 of pass 4):** `handle.waitForIdle()` was the platform's idle-detection primitive (per fresh review pass 4). `-p` mode called `handle.waitForIdle()` to wait for the team to be done. The ad-hoc `currentlyBusy` Set in `ui/cli.md` "jie -p" was removed. `StartJieOptions.onIdle` was retained for Day-2+ use. **Superseded 2026-06-14 by ADR 24** — `waitForIdle` and `onIdle` are removed from the handle; the CLI's `-p` mode owns its own idle gate.
- **2026-06-14 (ADR 24):** `handle.waitForIdle` and `StartJieOptions.onIdle` are **removed**. The CLI's `-p` mode owns its own idle gate (a local state machine over `agent.turn.start` and `agent.idle` events). The handle no longer exposes "is the work done?"; consumers compose it. The handle still owns the internal "bodies settled" bookkeeping needed for `stop()`'s graceful shutdown, but does not expose it. The new `{team_id}.team.loaded` event replaces the per-body startup `agent.idle` (reverses ADR 13 §3 J6) as the TUI's agents-panel-at-boot anchor. See `addrs/24-event-order-contract.md` for the full rationale and the Event-Order Contract.
