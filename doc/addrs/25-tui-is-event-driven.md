# ADR 25: TUI Is Event-Driven; It Does Not Access Agents Directly

## Status

Accepted. The TUI is a passive observer of the event bus. It does not call `handle.bodiesFor`, does not read `body.model`, does not read `body.soul.tools`. All agent state visible to the TUI is published on the bus.

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

The TUI's permitted surface on `JiePlatform` in v1 is:

- `bus: EventBus` — for subscribing to platform events.
- `stop: (timeoutMs?: number) => Promise<void>` — for shutdown.

The TUI does not read `body.model`, `body.soul.system_prompt`, `body.soul.tools`, or any other body field. The TUI derives per-agent state from the bus event stream — primarily the `team.loaded` event (which carries the per-agent roster with `is_leader`) and the per-body busy/idle transitions from `agent.turn.start` / `agent.idle`.

The CLI's `createApp` orchestrator captures the team info (`teamId`, `leaderRole`, `leaderKey`) from the `team.loaded` event and passes it to `runPrint`; the TUI does the same (subscribes to the bus, captures from the event, filters platform events by `team_id` from the envelope).

**Day 2+ multi-team addition.** When the TUI lands and multi-team processes become a real product, the handle regains three methods for the TUI's bootstrap and view-switching:

- `teamId: string` — the active team (set by the TUI's `/team <id>` slash command).
- `bodies(): Map<team_id, AgentBody[]>` — for the TUI's bootstrap and per-team queries.
- `loadTeam(teamId): Promise<void>` — for the TUI's `/team <id>` slash command (idempotent ensure-loaded per ADR 19).

The TUI's permitted surface in Day 2+ is `bus`, `teamId`, `bodies()`, `loadTeam`, and `stop`. The Day 2+ design is captured in `addrs/19-multi-team-coexistence.md`; v1 does not ship these methods.

### 2. The platform publishes enough information for the TUI to render

The TUI's information needs (per `doc/specs/jie-platform/ui/tui.md`) fall into three categories:

| TUI panel | Bus event(s) | Sufficient today? |
|---|---|---|
| Agents panel (roster) | `{team_id}.team.loaded` | **Yes** — payload is `{ team_id, agents: [{ role, agent_key, is_leader }] }`. |
| Busy/idle indicators | `agent.turn.start`, `agent.idle` (and the alternation contract per ADR 22) | **Yes**. |
| Live LLM output | `agent.stream.chunk`, `agent.stream.end` | **Yes**. |
| Tool telemetry | `agent.tool.call`, `agent.tool.result` | **Yes**. |
| Queue indicator | `agent.queue.update` | **Yes**. |

The `team.loaded` event payload carries `is_leader` (added in the round-6 update). The TUI's agents-panel-at-boot story is satisfied by this event; no per-body `agent.idle` at startup is needed (per ADR 22).

### 3. State is derived from the event stream

The TUI maintains a derived state, updated on each event. The render reads the derived state. This makes the renderer single-threaded (no need to lock against live bodies) and the derived state trivially testable (no need to mock `AgentBody`).

The exact shape of the derived state is the TUI's concern (per `ui/tui.md` "Layout is intentionally unspecified here"). The platform's only contract is: every piece of state the TUI displays has a corresponding bus event.

## Rationale

- **Consistency with the rest of the platform.** The platform is event-driven (ADR 22, ADR 19). Agents do not know about each other; they communicate through events. The TUI is "another agent" from the platform's perspective: a passive observer.
- **Replaceability.** A future CLI dashboard, web UI, or test fixture reads the same bus. The TUI is one consumer among many.
- **Coherent state.** The TUI's renderer reads its own derived state, not the live runtime. No races; no "the body is in the middle of a turn" surprises.
- **Platform completeness.** The platform must publish everything the TUI needs. Gaps in the bus surface become platform gaps (and are fixable in the platform), not TUI workarounds.
- **v1 handle surface is the minimum that the v1 CLI needs.** v1 has no TUI. The v1 handle's `{ bus, stop }` is exactly what the v1 CLI consumes; nothing more, nothing less. Day 2+ multi-team design lives in ADR 19 and is the right long-term shape.

## Consequences

- `JiePlatform` in v1 is `{ bus, stop }` only. The TUI's permitted v1 surface is the bus and the shutdown method. The CLI's `createApp` orchestrator captures the team info from the `team.loaded` event; the TUI will do the same when it lands.
- The `team.loaded` event payload is `{ team_id, agents: [{ role, agent_key, is_leader }] }` — `is_leader` is included for the TUI's agents panel. (No extension is needed at v1 launch; the per-agent `model_id` and `tools` are future work and a Day 2+ TUI-extension concern.)
- The TUI's state shape and rendering are its own concern. The platform's contract is: "every visible state has a bus event".
- Test fixtures for the TUI can replay a recorded event stream without instantiating bodies. This is a strong testing benefit.
- The `agent.queue.update` event is the queue indicator's source. The TUI does not poll the body's in-memory queue (which `AgentBody.peekQueue()` would have exposed; the dead-code removal in stage-2 cleanup drops that method).
- The Day 2+ multi-team design (`loadTeam`, `bodies()`, `teamId`) is captured in `addrs/19-multi-team-coexistence.md` and shipped when the TUI lands.
