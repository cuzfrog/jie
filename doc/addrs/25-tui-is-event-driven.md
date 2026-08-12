# ADR 25: TUI Is Event-Driven; It Does Not Access Agents Directly

## Status

Accepted. The TUI is a passive observer of the event bus. It does not read bodies, souls, or stores; all agent state visible to the TUI is published as events. `TuiDeps` is the `JiePlatform` handle alone (ADR 13, ADR 26).

## Context

Pull model has coherence/drift problems; push model fits.

## Decision

TUI permitted surface: handle (`subscribe`, `prompt`/`interrupt`, `execute`). Derives state from events only.

Every TUI indicator has an event source; gaps are platform gaps.

State derived from events; renderer reads derived state.

## Rationale
TUI is a passive observer like any agent; replaceable by replaying event stream.

## Consequences

- Shutdown: the TUI exits via the `stop` command; `Ctrl+C` publishes an interrupt event (see `doc/specs/ui/tui-shortcuts.md`), it does not stop bodies.
- Multi-team: the TUI's `/team <id>` persists the default (the `setDefaultTeam` command) and takes effect on the next process run; there is no live team swap on the platform side (ADR 26).
