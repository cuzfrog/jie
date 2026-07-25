# Team panel

A togglable bottom strip giving the team-at-a-glance view — roster, per-agent status, queue depth — that the footer (focused agent, per-agent model) does not convey. It is called out and navigated with `Shift+↑`/`Shift+↓` alone (no separate toggle key; `tui-shortcuts.md`): the first press while hidden shows the strip, further presses move the cursor between agents with the focus following live, and `Shift+↑` at the first agent hides it again. Hidden by default; session-only (never persisted), and preserved across `/clear` like the other view toggles.

## Layout

The strip is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top (splash, older scrollback) off rather than pushing the strip out of view. Hidden, it renders zero rows. There is no border or chrome — the cursor glyph marks the pointed agent.

## Interaction

- Hidden + either `Shift+↑` or `Shift+↓`: show the strip with the cursor on the focused agent, without moving. When the focus is null, direction `1` lands on the first agent, `-1` on the last.
- Shown + `Shift+↓`: move the cursor down, focus follows live; wraps last → first.
- Shown + `Shift+↑`: move the cursor up, except at the first agent, where it hides the strip and keeps the focus.
- No agents loaded: both keys are a no-op.

There is no Esc-to-close and no auto-close on submit; `teamPanelVisible` survives `clearTuiState`.

## Content

One row per agent, leader pinned first, the rest in map insertion order — `TuiState.rosterOrder` is the single shared ordering for both the cursor rule and the display:

```
▸ ★ general-1 · general
  coder-1 · coder · q2
```

Per row: the cursor (`▸` in `accent` on the focused agent, a space otherwise), the leader mark (`★` in `accent`; absent for non-leaders), the agent key (`accent` when focused), the status glyph, and the role plus a queue-depth tag `· q<N>` (`muted`) when the queue is non-empty. Every row truncates to the available width.

**Status glyph**: `·` (`muted`) idle; a braille spinner frame derived from `Date.now() / SPINNER_INTERVAL_MS` (`accent`) busy — the same frames and interval as the working indicator; `✗` (`error`) idle with `lastStopReason === "error"`. The clock is read render-side, consistent with the reducer purity model (`tui-state.md`).

**Model is deliberately not shown**: the footer already carries the per-agent model at full width; the strip owns what the footer cannot — roster, status, queue. The one-row format is deliberately roomy: richer per-agent information can join the row later.

## State

`state.teamPanelVisible: boolean` (initial `false`), set by the `switchCycleAgent` cursor rule above (the ui-reducer). `clearTuiState` does not reset it — the same class as `thinkingExpanded` / `toolCardsExpanded`. The strip re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`).
