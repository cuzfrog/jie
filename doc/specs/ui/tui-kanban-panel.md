# Kanban panel

A togglable bottom panel showing the loaded team's kanban board — the cards the team maintains through `kanban_write` and the `/kanban` command (`06-agent-model.md`). `Ctrl+K` or `/kanban` (no args) toggles it (`tui-shortcuts.md`). Hidden by default; the toggle and the board survive `/clear` like the other view toggles. It shares its bottom slot with the team panel and the two are mutually exclusive: showing one hides the other, enforced by both toggles in the reducer.

## Data

The board is one shared `state.kanbanBoard` for the loaded team — not per-agent — seeded from `teamInfo.kanbanCards` on team load and refreshed by the platform's kanban command results (`kanbanAdd`/`kanbanRemove`/`kanbanComplete`/`kanbanEdit` responses carry the full board back). The platform persists it per session per team (`storage/transcript-store.ts`, `kanban_write`), so the board is visible across team members and survives TUI restarts.

Every card carries a stable id (`K1`, `K2`, …) assigned per session by the platform, plus `content`, `status` (`pending` | `in_progress` | `completed`), and optional `active_form` and `description`. The `/kanban add` command distills a short title from a long description; the full description stays on the card and is shown in the expanded detail view.

## Layout

The panel is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top off rather than pushing the panel out of view. Hidden, it renders zero rows. It is the same thin full box as the team panel — `┌─…─┐` top, `│` sides, `└─…─┘` bottom in `borderMuted` — with the board inset one cell inside the box, followed by a `dim` shortcut-hint line below the box.

## Content

### Board (collapsed)

The board split by status into three equal-width columns — **Pending**, **In Progress**, **Done** — separated by two spaces. The first row titles each column with its name and card count in `dim`; below it one row per card, the content truncated to the column width and colored by status: pending `text`, in-progress `accent`, completed `muted`. Every card row is padded to the column width and given a card background (`bg("card")`); the cursor row — the card matching `state.kanbanCursor` — uses the stronger `bg("cursor")` background instead. A column with more than eight cards shows the first eight plus a `dim` `+N more` marker; a board without cards renders the three headers alone.

### Card detail (expanded)

`Tab` expands the focused card to fill the whole panel: one card-wide block with the card background, the first line `K1 · <content>` in `text`, then `status: <status>`, `active: <active_form>` when present, and `description: <description>` when present, all in `muted`. A board with no cursor renders `no task selected`. `Esc` collapses back to the board.

## Interaction

- `Ctrl+K` hidden: show the panel. `Ctrl+K` shown: hide it. `/kanban` with no args does the same. Both work regardless of the editor cursor position and while the autocomplete popup is open — like `Ctrl+T`/`Ctrl+O`, not like `←` (`tui-shortcuts.md`).
- No agent focused (before a team is loaded): toggling is a no-op.
- Showing the kanban panel hides the team panel and clears its cursor; opening the team panel hides the kanban panel and clears `kanbanEdit` and `kanbanExpanded`. They never render together.
- While the panel is shown, `↑`/`↓`/`←`/`→` move the cursor card: up/down walk the current column, left/right jump to the nearest non-empty column (rows clamp to the target column's length). A cursor absent or stale recovers to the first card; an empty board renders no cursor. `←` yields to the team panel toggle while the editor cursor sits at the buffer start (`tui-shortcuts.md`), so the two panels stay reachable from each other.
- `Tab` expands the focused card to the detail view; `Esc` (expanded) collapses it. While expanded, `Tab` collapses back.
- `Enter` commits the focused card id to `state.kanbanEdit` and the editor takes over (`tui-layout.md`, Editor): its buffer pre-fills with the card content and the top border shows an `editing <id>` chip. `Enter` again or `Ctrl+S` saves — the platform `kanbanEdit` command runs and its returned board replaces `state.kanbanBoard`; `Esc` or `Ctrl+C` cancels and restores the prior draft. The panel stays open while editing; the shortcut hint line switches to `enter/ctrl+s save · esc cancel`.
- While editing, all keys route to the editor — cursor movement, expand/collapse, and the panel toggle's `Ctrl+K` close are suspended (closing the panel also cancels the edit and resets `kanbanExpanded`).

## State

The panel's five fields live on `TuiState` (`tui-state.md`): `kanbanPanelVisible: boolean` (initial `false`), `kanbanBoard: ReadonlyArray<KanbanCard>` (initial `[]`), `kanbanCursor: string | null` (a card id, or `null` on an empty board), `kanbanExpanded: boolean`, and `kanbanEdit: string | null` (the card id being edited, or `null`). All kanban actions reduce through one `kanbanReducer` (`packages/jie-tui/state/kanban-reducer.ts`), shared by `ui-reducer.ts`, `team-load-reducer.ts` (board seeding on team load), and `event-reducer.ts` (the `kanban_write` result) — the reducer sharing pattern of `state/MODULE.md`. Rendering and cursor navigation both operate on the visible window `TuiState.kanbanVisibleCards` — per status column the first eight cards, in board order — while the column counts read the full board. The panel re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`). While the panel is shown the footer drops its second line, as with the team panel (`tui-layout.md`, Footer).
