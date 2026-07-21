# ADR 25: TUI Is Event-Driven; It Does Not Access Agents Directly

## Status

Accepted. The TUI is a passive observer of the event bus. It does not read bodies, souls, or stores; all agent state visible to the TUI is published as events. `TuiDeps` is the `JiePlatform` handle alone (ADR 13, ADR 26).

## Context

The natural design for a TUI is to expose the runtime objects (`AgentBody[]`, `AgentSoul`, etc.) and let the TUI pull state when it needs to render. The pull model has well-known problems in an event-driven system:

- **State coherence.** A render that reads `body.soul` and `body.state.isStreaming` races a bus event that mutates one of them mid-read.
- **Inconsistent state sources.** Some state is in the body, some on the bus, some in the team blueprint; the TUI fans out reads across all of them.
- **The bus becomes decorative.** The TUI subscribes, but the bodies' state is the source of truth.

The push model is the natural fit: the TUI subscribes, the bodies publish, and the TUI's view is a derived state built from the event stream.

## Decision

### 1. The TUI derives agent state from the event stream

The TUI's permitted surface on `JiePlatform` is the handle itself — `subscribe` for events, `prompt` / `interrupt` for input, `execute` for slash-command operations, `settings` for defaults (canonical shape in ADR 13/26). It reads no `body.model`, no `body.soul.system_prompt`, no `body.soul.tools`, no `AuthStore` / `SettingsStore` / `TeamRegistry` / `GitService` reference. Per-agent roster and busy/idle state come from `system.team.loaded` and the `agent.turn.start` / `agent.idle` alternation; the active team's id is the TUI's own reducer state, not a platform field.

### 2. The platform publishes enough information for the TUI to render

| TUI panel | Event(s) |
|---|---|
| Agents rail (roster) | `system.team.loaded` (payload carries the per-agent roster with `isLeader`) |
| Busy/idle indicators | `agent.turn.start`, `agent.idle` (strict alternation — event-order contract in `03-event-system.md`) |
| Live LLM output | `agent.stream.chunk`, `agent.stream.end` |
| Tool telemetry | `agent.tool.call`, `agent.tool.result` |
| Queue indicator | `agent.prompt.queue.update` |
| Model indicator | `agent.model.assigned` |

Gaps in this table are platform gaps, fixable in the platform — not TUI workarounds. The TUI never polls body state (e.g. the in-memory prompt queue); every indicator has an event source.

### 3. State is derived, not read

The TUI maintains a derived state, updated on each event; the render reads the derived state. The renderer is single-threaded (no locking against live bodies) and the derived state is trivially testable (feed it events; no `AgentBody` mock). The exact shape is the TUI's concern (`doc/specs/ui/tui-state.md`); the platform's only contract is: every piece of state the TUI displays has a corresponding event.

## Rationale

- **Consistency with the platform.** Agents do not know about each other; they communicate through events. The TUI is "another agent" from the platform's perspective: a passive observer.
- **Replaceability.** A CLI dashboard, web UI, or test fixture reads the same events. The TUI is one consumer among many; test fixtures can replay a recorded event stream without instantiating bodies.
- **Coherent state.** The renderer reads its own derived state, not the live runtime — no "the body is in the middle of a turn" surprises.

## Consequences

- Shutdown: the TUI exits via the `stop` command; `Ctrl+C` publishes an interrupt event (see `doc/specs/ui/tui-shortcuts.md`), it does not stop bodies.
- Multi-team: the TUI's `/team <id>` persists the default (the `setDefaultTeam` command) and takes effect on the next process run; there is no live team swap on the platform side (ADR 26).
