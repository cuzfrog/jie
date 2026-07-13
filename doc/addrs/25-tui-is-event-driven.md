# ADR 25: TUI Is Event-Driven; It Does Not Access Agents Directly

## Status

Accepted. The TUI is a passive observer of the event bus. It does not call `handle.bodiesFor`, does not read `body.model`, does not read `body.soul.tools`. All agent state visible to the TUI is published on the bus. The v0.2 update (2026-06-27) promotes the handle surface from `{ bus, stop }` to `{ bus, teamId, bodies(), loadTeam, stop }` because v0.2 ships multi-team in the TUI; the TUI's read-only relationship with the bus is unchanged.

**v0.2 follow-up.** The handle surface grows to expose the TUI's full surface — the runtime methods plus a flat set of typed publishers (`subscribe`, `userPrompt`, `interrupt`) and slash-command operations (`login`, `logout`, `setDefaultModel`, `getDefaultTeam`, `getDefaultModel`, `listInstalledTeams`, `getGitStatus`). The TUI's `TuiDeps` is now a single object: the `JiePlatform` facade. The TUI no longer imports any store type from `jie-platform/{config,team,services}`. The event-driven principle (this ADR) is unchanged.

## Context

The natural design for a TUI is to expose the runtime objects (`JieHandle`, `AgentBody[]`, `AgentSoul`, etc.) and let the TUI query them. This is the "active observer" model: the TUI pulls state when it needs to render.

The pull model has well-known problems in an event-driven system:

- **State coherence.** A TUI render reads `body.soul` and `body.state.isStreaming`; a bus event mutates one of these mid-read. The render is racy.
- **Inconsistent state sources.** Some state is in the body, some is on the bus, some is in the team's blueprint. The TUI ends up fanning out reads across all of them.
- **The bus becomes a one-way notification channel.** The TUI subscribes to events but the bodies' state is the source of truth. The bus is decorative.

The push model is the natural fit:

- **All state flows through the bus.** The TUI subscribes; the bodies publish. The TUI's view is a stream of events.
- **State coherence is local.** The TUI's renderer holds a derived state built from the event stream. A render reads the derived state, not the live bodies.
- **The TUI is replaceable.** Any other consumer (a CLI dashboard, a web UI, a test fixture) reads the same bus events. The bus is the public surface of the runtime.

## Decision

### 1. The TUI does not call into `JiePlatform` for agent state

The TUI's permitted surface on `JiePlatform` in v0.2 is:

- `events` — `subscribe(topic, cb)` for receiving typed envelopes per topic; `userPrompt(agentKey, text)` for publishing a user prompt; `interrupt()` for publishing an interrupt.
- `team: { id; agents }` — the active team's metadata.
- `loadTeam(teamId): Promise<void>` — for the TUI's `/team <id>` slash command (idempotent ensure-loaded per ADR 19).
- `login` / `logout` / `setDefaultModel` / `getDefaultTeam` / `getDefaultModel` / `listInstalledTeams` — slash-command operations on the auth and settings stores, hidden behind the facade.
- `getGitStatus()` — for the status bar.
- `stop(): Promise<void>` — for shutdown.

The TUI does not read `body.model`, `body.soul.system_prompt`, `body.soul.tools`, or any other body field. The TUI derives per-agent state from the bus event stream — primarily the `team.loaded` event (which carries the per-agent roster with `is_leader`) and the per-body busy/idle transitions from `agent.turn.start` / `agent.idle`. The TUI's `TuiDeps` is the `JiePlatform` handle alone; no store handles or `AuthStore`/`SettingsStore`/`TeamRegistry`/`GitService` references reach the TUI's module surface.

The CLI's `createApp` orchestrator captures the team info (`teamId`, `leaderRole`, `leaderKey`) from the `team.loaded` event and passes it to `runPrint`; the TUI does the same (subscribes to the bus, captures from the event, filters platform events by `team_id` from the envelope).

**v1 → v0.2 promotion.** v0.2 ships multi-team in the TUI (per `ui/tui-overview.md` "Boundary with the platform" and `ui/tui-user-scenarios.md` T3). The handle gains `teamId`, `bodies()`, and `loadTeam` in v0.2. The TUI is the only caller of `loadTeam`; the v1 CLI's `-p` mode keeps its single-team shape and does not adopt the new methods. The Day 2+ design (formerly in the v1 "Day 2+ multi-team addition" paragraph below) is the v0.2 design; the ADR is updated.

### 2. The platform publishes enough information for the TUI to render

The TUI's information needs (per `doc/specs/jie-platform/ui/tui-overview.md`) fall into three categories:

| TUI panel | Bus event(s) | Sufficient today? |
|---|---|---|
| Agents panel (roster) | `{team_id}.team.loaded` | **Yes** — payload is `{ team_id, agents: [{ role, agent_key, is_leader }] }`. |
| Busy/idle indicators | `agent.turn.start`, `agent.idle` (and the alternation contract per ADR 22) | **Yes**. |
| Live LLM output | `agent.stream.chunk`, `agent.stream.end` | **Yes**. |
| Tool telemetry | `agent.tool.call`, `agent.tool.result` | **Yes**. |
| Queue indicator | `agent.prompt.queue.update` | **Yes**. |

The `team.loaded` event payload carries `is_leader` (added in the round-6 update). The TUI's agents-panel-at-boot story is satisfied by this event; no per-body `agent.idle` at startup is needed (per ADR 22).

### 3. State is derived from the event stream

The TUI maintains a derived state, updated on each event. The render reads the derived state. This makes the renderer single-threaded (no need to lock against live bodies) and the derived state trivially testable (no need to mock `AgentBody`).

The exact shape of the derived state is the TUI's concern (per `ui/tui-state.md` "Reducer rules"). The platform's only contract is: every piece of state the TUI displays has a corresponding bus event.

## Rationale

- **Consistency with the rest of the platform.** The platform is event-driven (ADR 22, ADR 19). Agents do not know about each other; they communicate through events. The TUI is "another agent" from the platform's perspective: a passive observer.
- **Replaceability.** A future CLI dashboard, web UI, or test fixture reads the same bus. The TUI is one consumer among many.
- **Coherent state.** The TUI's renderer reads its own derived state, not the live runtime. No races; no "the body is in the middle of a turn" surprises.
- **Platform completeness.** The platform must publish everything the TUI needs. Gaps in the bus surface become platform gaps (and are fixable in the platform), not TUI workarounds.
- **v0.2 handle surface is the minimum that the v0.2 TUI needs.** v0.2 ships a TUI; the v0.2 handle's `{ bus, teamId, bodies(), loadTeam, stop }` is exactly what the v0.2 TUI consumes; nothing more, nothing less. The v1 CLI's `-p` mode uses only `{ bus, stop }`; the multi-team methods are TUI-only in v0.2. The Day 2+ cross-process team visibility is the right long-term shape; v0.2 is in-process only.

## Consequences

- `JiePlatform` in v0.2 is the full facade: `{ events (subscribe/userPrompt/interrupt), team, loadTeam, stop, login, logout, setDefaultModel, getDefaultTeam, getDefaultModel, listInstalledTeams, getGitStatus }`. The TUI's permitted v0.2 surface is the facade plus the event protocol types (`EventEnvelope<T>`, `AnyEventEnvelope`, `EventType`) re-exported from `jie-platform`. The TUI's `TuiDeps` is `{ platform: JiePlatform }`.
- The v0.2 TUI's `stop()` semantics: iterates every loaded team's bodies and stops them. In-flight turns are **not** awaited (per `09-deployment.md` step 4 limitation, kept in v0.2; revisit in v0.3). The TUI's `Ctrl+C` path publishes a synthetic interrupt event (per `ui/tui-shortcuts.md` "Esc×2 vs Ctrl+C") and does not call `stop`; the TUI exits only on `Ctrl+D` or `/exit`.
- The `team.loaded` event payload is `{ team_id, agents: [{ role, agent_key, is_leader }] }` — `is_leader` is included for the TUI's agents panel. The TUI's per-team roster is built from this event for every loaded team (the TUI subscribes to the per-process subject and filters by active `team_id`).
- The TUI's state shape and rendering are its own concern (see `ui/tui-state.md` "Reducer rules" and `ui/tui-layout.md`). The platform's contract is: "every visible state has a bus event".
- Test fixtures for the TUI can replay a recorded event stream without instantiating bodies (see `ui/tui-overview.md` "Test strategy"). This is a strong testing benefit and is the foundation of the v0.2 TUI test plan (`ui/tui-user-scenarios.md` T1–T5).
- The `agent.prompt.queue.update` event is the queue indicator's source. The TUI does not poll the body's in-memory queue (which `AgentBody.peekQueue()` would have exposed; the dead-code removal in stage-2 cleanup drops that method).
- The multi-team design (`loadTeam`, `bodies()`, `teamId`) is captured in `addrs/19-multi-team-coexistence.md` and ships in v0.2 with the TUI's `/team` slash command.
