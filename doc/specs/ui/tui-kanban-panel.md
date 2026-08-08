# Kanban panel

The loaded team's kanban board — the cards the team maintains through `kanban_write` and the `/kanban` command (`06-agent-model.md`) — has three view states, cycled by `Ctrl+K` or `/kanban` (no args): **hidden** → **list** → **panel** → hidden (`tui-shortcuts.md`). The list view is the compact `Todo:` block below the chat (`tui-layout.md`); it coexists with the team panel. The panel view is the bottom panel rendering the full board; it shares its bottom slot with the team panel and the two are mutually exclusive: entering one hides the other, enforced by both reducers. Hidden by default; the view and the board survive `/clear` like the other view toggles.

## Data

The board is one shared `state.kanbanBoard` for the loaded team — not per-agent — seeded from `teamInfo.kanbanCards` on team load and refreshed by the platform's kanban command results (`kanbanAdd`/`kanbanRemove`/`kanbanSetStatus`/`kanbanEdit`/`kanbanHandoff` responses carry the full board back). The platform persists it per team (`storage/kanban-store.ts`, `kanban_write`), so the board crosses sessions, is visible across team members and survives TUI restarts. `kanbanHandoff` removes the card from the source team and recreates it as a team-scoped card on the target team.

Every card carries a stable id (`#1`, `#2`, …) assigned per team by the platform, plus `content`, `status` (`pending` | `in_progress` | `in_review` | `completed`), `scope` (`team` | `session`), optional `active_form`, `description`, `sessionId` (when `scope` is `session`), and `externalRef` (e.g. `G#42` or `J#7`). The `/kanban add` command distills a short title from a long description; the full description stays on the card and is shown in the expanded detail view.

## Layout

The panel is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top off rather than pushing the panel out of view. Hidden, it renders zero rows. It is the same thin full box as the team panel — `┌─…─┐` top, `│` sides, `└─…─┘` bottom in `borderMuted` — with the board inset one cell inside the box, followed by a `dim` shortcut-hint line below the box.

## Content

### Board (collapsed)

The board split by status into four equal-width columns — **Pending**, **In Progress**, **In Review**, **Done** — separated by two spaces. The first row titles each column with its name and card count in `dim`; below it one row per card: a `▸` cursor in `accent` directly before the card content when the card matches `state.kanbanCursor` (a one-space indent otherwise), then the content truncated to the remaining column width and colored by status: pending `text`, in-progress `accent`, in-review `warning`, completed `muted`. Rows carry no background. A column with more than eight cards shows the first eight plus a `dim` `+N more` marker; a board without cards renders the four headers alone.

### Card detail (expanded)

`Tab` expands the focused card to fill the whole panel. The top border shows the card id as a left-aligned chip on the upper frame, e.g. `┌ #1 ──…`. Inside the box, two selectable rows render in order: the card content in `text` with a leading `▸` cursor in `accent` when `state.kanbanEditField` is `content`, and the description in `muted` (or `dim` `description:` placeholder when absent) with a leading `▸` when `state.kanbanEditField` is `description`. Below them `status: <status>` in `muted`, `scope: <team|session>` in `muted`, `ref: <externalRef>` in `muted` when present, and `active: <active_form>` in `muted` when present. Rows carry no background. A board with no cursor renders `no task selected`. `Esc` collapses back to the board.

## Interaction

- `Ctrl+K` cycles the view: hidden → list → panel → hidden; `/kanban` with no args does the same. Both work regardless of the editor cursor position and while the autocomplete popup is open — like `Ctrl+T`/`Ctrl+O`, not like `←` (`tui-shortcuts.md`).
- No agent focused (before a team is loaded): cycling is a no-op.
- Entering the panel view hides the team panel and clears its cursor; opening the team panel hides the panel view and clears `kanbanEdit` and `kanbanExpanded`. The panel view and the team panel never render together; the list view coexists with the team panel.
- While the panel view is shown, `↑`/`↓`/`←`/`→` move the cursor card: up/down walk the current column, left/right jump to the nearest non-empty column (rows clamp to the target column's length). A cursor absent or stale recovers to the first card; an empty board renders no cursor. `←` always moves the kanban cursor in the panel view — even at the editor buffer start — so the team panel's `←` toggle is suspended while the panel view is shown.
- `Tab` expands the focused card to the detail view; `Esc` (expanded) collapses it. While expanded, `Tab` collapses back.
- While expanded, `↑`/`↓` move the selection between the `content` and `description` fields (`state.kanbanEditField`). `Ctrl+E` commits the focused card id and the selected field to `state.kanbanEdit`; the editor takes over (`tui-layout.md`, Editor): its buffer pre-fills with the selected field (`content` or `description`) and the top border shows an `editing <id>` chip. `Enter` stays the prompt submit while the panel view is shown — edit mode is entered only through `Ctrl+E`. Once editing, `Enter` or `Ctrl+S` saves — the platform `kanbanEdit` command runs with the field and text, and its returned board replaces `state.kanbanBoard`; `Esc` or `Ctrl+C` cancels and restores the prior draft. The panel stays open while editing; the shortcut hint line switches to `enter/ctrl+s save · esc cancel`.
- While editing, all keys route to the editor — cursor movement, expand/collapse, and `Ctrl+K`'s view cycle are suspended (leaving the panel view also cancels the edit and resets `kanbanExpanded`).

## State

The view's six fields live on `TuiState` (`tui-state.md`): `kanbanView: "hidden" | "list" | "panel"` (initial `"hidden"`), `kanbanBoard: ReadonlyArray<KanbanCard>` (initial `[]`), `kanbanCursor: string | null` (a card id, or `null` on an empty board), `kanbanExpanded: boolean`, `kanbanEdit: string | null` (the card id being edited, or `null`), and `kanbanEditField: "content" | "description"` (initial `"content"`). All kanban actions reduce through one `kanbanReducer` (`src/tui/state/kanban-reducer.ts`), shared by `ui-reducer.ts`, `team-load-reducer.ts` (board seeding on team load), and `event-reducer.ts` (the `kanban_write` result) — the reducer sharing pattern of `state/MODULE.md`. Rendering and cursor navigation both operate on the visible window `TuiState.kanbanVisibleCards` — per status column the first eight cards, in board order — while the column counts read the full board. The panel re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`). While the panel view is shown the footer drops its second line, as with the team panel (`tui-layout.md`, Footer).
