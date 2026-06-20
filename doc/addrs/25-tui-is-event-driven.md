# ADR 25: TUI Is Event-Driven; It Does Not Access Agents Directly

## Status

Accepted. The TUI is a passive observer of the event bus. It does
not call `handle.bodiesFor`, does not read `body.model`, does not
read `body.soul.tools`. All agent state visible to the TUI is
published on the bus.

## Context

The natural design for a TUI is to expose the runtime objects
(`JieHandle`, `AgentBody[]`, `AgentSoul`, etc.) and let the TUI
query them. This is the "active observer" model: the TUI pulls
state when it needs to render.

The pull model has well-known problems in an event-driven system:

- **State coherence.** A TUI render reads `body.soul` and
  `body.state.isStreaming`; a bus event mutates one of these
  mid-read. The render is racy.
- **Inconsistent state sources.** Some state is in the body, some
  is on the bus, some is in the team's blueprint. The TUI ends up
  fanning out reads across all of them.
- **The bus becomes a one-way notification channel.** The TUI
  subscribes to events but the bodies' state is the source of
  truth. The bus is decorative.

The push model is the natural fit:

- **All state flows through the bus.** The TUI subscribes; the
  bodies publish. The TUI's view is a stream of events.
- **State coherence is local.** The TUI's renderer holds a derived
  state built from the event stream. A render reads the derived
  state, not the live bodies.
- **The TUI is replaceable.** Any other consumer (a CLI dashboard,
  a web UI, a test fixture) reads the same bus events. The bus is
  the public surface of the runtime.

## Decision

### 1. The TUI does not call into `JieHandle` for agent state

The TUI's permitted surface on `JieHandle` is:

- `bus: EventBus` — for subscribing to platform events.
- `teamId: string` — for filtering platform events to the active team.
- `bodies(): Map<teamId, AgentBody[]>` — for the TUI's own bootstrap
  (knowing the team exists, listing its bodies for the agents panel).
- `loadTeam(teamId): Promise<void>` — for the TUI's `/team <id>`
  command (idempotent ensure-loaded per ADR 19).
- `stop()` — for shutdown.

The TUI does not read `body.model`, `body.soul.system_prompt`,
`body.soul.tools`, or any other body field. (The earlier
`artifacts` and `rolesFor` convenience methods on the handle were
removed in ADR 13's "minimal handle" revision; the TUI's
artifact access, when needed, is via the bodies' `artifacts`
field, and role stems are derived from `bodies().get(teamId)?.map(b => b.soul.role)`.)

### 2. The platform publishes enough information for the TUI to render

The TUI's information needs (per `doc/specs/jie-platform/ui/tui.md`)
fall into three categories:

| TUI panel | Bus event(s) | Sufficient today? |
|---|---|---|
| Agents panel (roster) | `{team_id}.team.loaded` | **No** — payload is `{ team_id, agents: [{ role, agent_key }] }`, missing model id, tool list. Stage-2 will extend. |
| Busy/idle indicators | `agent.turn.start`, `agent.idle` (and the alternation contract per ADR 22) | **Yes**. |
| Live LLM output | `agent.stream.chunk`, `agent.stream.end` | **Yes**. |
| Tool telemetry | `agent.tool.call`, `agent.tool.result` | **Yes**. |
| Queue indicator | `agent.queue.update` | **Yes**. |

The `team.loaded` event payload is the only gap. Stage-2 will extend
it to include per-agent `model_id`, `tools` (resolved tool names),
and any other state the agents panel needs at boot. The extension
keeps the wire format uniform (per the optional-fields decision
recorded in the stage-1 review): per-body fields go inside the
envelope or in `payload.agents[]`; the existing
`{ team_id, agents: [...] }` shape is preserved.

### 3. State is derived from the event stream

The TUI maintains a derived state, updated on each event. The
render reads the derived state. This makes the renderer
single-threaded (no need to lock against live bodies) and the
derived state trivially testable (no need to mock `AgentBody`).

The exact shape of the derived state is the TUI's concern (per
`ui/tui.md` "Layout is intentionally unspecified here"). The
platform's only contract is: every piece of state the TUI
displays has a corresponding bus event.

## Rationale

- **Consistency with the rest of the platform.** The platform is
  event-driven (ADR 22, ADR 19). Agents do not know about each
  other; they communicate through events. The TUI is "another
  agent" from the platform's perspective: a passive observer.
- **Replaceability.** A future CLI dashboard, web UI, or test
  fixture reads the same bus. The TUI is one consumer among many.
- **Coherent state.** The TUI's renderer reads its own derived
  state, not the live runtime. No races; no "the body is in the
  middle of a turn" surprises.
- **Platform completeness.** The platform must publish everything
  the TUI needs. Gaps in the bus surface become platform gaps
  (and are fixable in the platform), not TUI workarounds.

## Consequences

- `JieHandle` does not gain a `bodiesForTui()` method or similar.
  The TUI's permitted surface is the bus, the team's bodies (via
  `bodies().get(teamId)`), and the lifecycle methods (`loadTeam`,
  `stop`).
- The `{team_id}.team.loaded` payload is extended (per stage-2
  work) to carry the model id and resolved tool list per agent.
  The extension is a wire-format change; the existing fields are
  preserved.
- The TUI's state shape and rendering are its own concern. The
  platform's contract is: "every visible state has a bus event".
- Test fixtures for the TUI can replay a recorded event stream
  without instantiating bodies. This is a strong testing benefit.
- The `agent.queue.update` event is the queue indicator's source.
  The TUI does not poll the body's in-memory queue (which
  `AgentBody.peekQueue()` would have exposed; the dead-code
  removal in stage-2 cleanup drops that method).
