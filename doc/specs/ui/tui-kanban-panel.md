# Kanban panel

A togglable bottom panel showing the focused agent's kanban board — the cards the agent maintains through `kanban_write` (`06-agent-model.md`). `Ctrl+K` toggles it (`tui-shortcuts.md`). Hidden by default; session-only (never persisted), and preserved across `/clear` like the other view toggles. It shares its bottom slot with the team panel and the two are mutually exclusive: showing one hides the other, enforced by both toggles in the reducer.

## Layout

The panel is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top off rather than pushing the panel out of view. Hidden, it renders zero rows. It is the same thin full box as the team panel — `┌─…─┐` top, `│` sides, `└─…─┘` bottom in `borderMuted` — with the board inset one cell inside the box.

## Content

The focused agent's `cards` split by status into three equal-width columns — **Pending**, **In Progress**, **Done** — separated by two spaces. The first row titles each column with its name and card count in `dim`; below it one row per card, the content truncated to the column width and colored by status: pending `text`, in-progress `accent`, completed `muted`. A column with more than eight cards shows the first eight plus a `dim` `+N more` marker; a board without cards renders the three headers alone. Every row is padded or truncated to the available width.

## Interaction

- `Ctrl+K` hidden: show the panel. `Ctrl+K` shown: hide it. The toggle works regardless of the editor cursor position and while the autocomplete popup is open — like `Ctrl+T`/`Ctrl+O`, not like `←` (`tui-shortcuts.md`).
- No agents focused (before a team is loaded): `Ctrl+K` is a no-op.
- Showing the kanban panel hides the team panel and clears its cursor; opening the team panel hides the kanban panel. They never render together.

The panel is read-only: no cursor, no commit, no Esc-to-close, and no auto-close on submit; `kanbanPanelVisible` survives `clearTuiState`.

## State

`state.kanbanPanelVisible: boolean` (initial `false`), set by the `toggleKanbanPanel` action (the ui-reducer, `tui-state.md`). The panel re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`). While the panel is shown the footer drops its second line, as with the team panel (`tui-layout.md`, Footer).
