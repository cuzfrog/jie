# Team panel

A toggleable left panel giving the team-at-a-glance view — roster, per-agent status, queue depth — that the footer (focused agent, per-agent model) and the agent-cycle keys do not convey. `Shift+←` toggles it (alias `Ctrl+←`, same terminal-variance reason as the cycle keys; `tui-shortcuts.md`). Hidden by default; session-only (never persisted), and preserved across `/clear` like the other view toggles.

## Layout

When `state.teamPanelVisible`, the chat section renders as `panel │ chat`. Every other section — todos, working slot, status line, welcome splash, editor, footer — keeps the full terminal width: the editor sits below the panel and spans the whole row, so focus handling is unchanged. pi-tui containers stack vertically only, so the split is composed by the jie-owned `SplitPane` component (`components/split-pane.ts`): it renders both sides at their own width and joins them line by line, space-padding the shorter column. The separator is `│` in `borderMuted`.

**Panel width** `panelWidth(cols)`:

- `cols >= 80` → 24 columns, fixed.
- `cols < 80` → `max(12, floor(cols * 0.25))`.
- The panel collapses (chat reclaims the full width) whenever the chat column would drop below 20 columns; the toggle state is kept, so a widening resize brings the panel back.

The view gates this policy on `state.teamPanelVisible`: when hidden, `SplitPane`'s width function returns `null` and the chat renders alone — hidden and collapsed are the same render path.

## Content

Top-aligned (the pi-tui inline model has no full-height body to center within; the vertical centering of the pre-rebase Ink rail does not apply). One agent per two rows, leader pinned first, the rest in map insertion order:

```
★ general-1
  ⠙ general · q2
  coder-1
  · coder
```

Row 1 is the leader mark (`★` in `accent`; a space for non-leaders) plus the agent key (`accent` when it is the focused agent, default color otherwise). Row 2 is the status glyph, the role, and a queue-depth tag `· q<queue length>` only when the queue is non-empty; every row truncates to the panel width.

**Status glyph**: `·` (`muted`) idle; a braille spinner frame derived from `Date.now() / SPINNER_INTERVAL_MS` (`accent`) busy — the same frames and interval as the working indicator, so the panel animates exactly while the working indicator's loader ticks (i.e. while any agent is busy) and stays static otherwise; `✗` (`error`) idle with `lastStopReason === "error"`. The clock is read render-side, consistent with the reducer purity model (`tui-state.md`).

**Model is deliberately not shown**: the footer already carries the per-agent model at full width; the panel owns what the footer cannot — roster, status, queue.

## State

`state.teamPanelVisible: boolean` (initial `false`), flipped by `Actions.toggleTeamPanel()` (`[ui] toggle team panel`) in the ui-reducer. `clearTuiState` does not reset it — the same class as `thinkingExpanded` / `toolCardsExpanded`. The panel re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`).
