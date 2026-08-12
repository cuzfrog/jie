# ADR 39: Panel Input Routing via pi-tui Focus

## Status

Accepted (2026-08). Extends ADR 30 (pi-tui migration) and ADR 38 (pull-based rendering).

## Context

Kanban keys were routed by `view.handleInput` calling `kanbanPanel.resolveKey(data, state, popupOpen)` — a jie-specific key-resolution protocol bolted onto `TuiComponent`, duplicating what pi-tui already models as focus (`screen.setFocus`, `Component.handleInput`).

## Decision

Use pi-tui focus as the panel input router.

- A panel that receives keyboard input implements `Component.handleInput(data)` and becomes the focused component while it is the input owner. `view.update()` reconciles focus from state (`kanbanView === "panel" && kanbanEdit === null` → kanban panel, else editor); this runs synchronously on dispatch, so routing has no lag.
- pi-tui does not fall through from the focused component, so a panel delegates unhandled keys to an editor key-fallback (narrow constructor-injected interface: `handleInput`, `isShowingAutocomplete`). The panel does not know the editor's internals.
- `view.handleInput` (the input listener, which pi-tui runs before the focused component) keeps global shortcuts (ctrl+t/ctrl+o/ctrl+k, left-at-start) and editor-scoped keys (team cursor), and skips the editor-scoped keys when a panel is focused.
- `TuiComponent.resolveKey` is removed.

## Consequences

- Future input-taking panels (e.g. settings) follow the same pattern: implement `handleInput`, take the key fallback, add one focus rule in the view.
- When the team panel and kanban panel are both visible, the focused kanban panel owns arrows and enter; previously arrows went to kanban but enter committed the team cursor — inconsistent.
- While a panel is focused the editor stops emitting `CURSOR_MARKER`, so the hardware cursor / IME anchor leaves the editor; the rendered block cursor is unaffected.
- Kanban edit persistence (`SAVE_KANBAN_EDIT`) moves from `TuiImpl` to `CommandHandlerImpl`, which owns command side effects; `TuiImpl` keeps only lifecycle wiring.
