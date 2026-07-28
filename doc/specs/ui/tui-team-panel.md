# Team panel

A togglable bottom strip giving the team-at-a-glance view — roster, per-agent status and configuration, queue depth — that the footer (focused agent, per-agent model) does not convey. It is called out and navigated with `Shift+↑`/`Shift+↓` alone (no separate toggle key; `tui-shortcuts.md`): the first press while hidden shows the strip, further presses move the cursor between agents without switching context, `Enter` commits the pointed agent as the focused one, and `Shift+↑` at the first agent hides it again. Hidden by default; session-only (never persisted), and preserved across `/clear` like the other view toggles.

## Layout

The strip is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top (splash, older scrollback) off rather than pushing the strip out of view. Hidden, it renders zero rows. There is no border or chrome — the cursor glyph marks the pointed agent.

## Interaction

- Hidden + either `Shift+↑` or `Shift+↓`: show the strip with the cursor (`state.teamCursorAgentId`) on the focused agent, without moving. When the focus is null, direction `1` lands on the first agent, `-1` on the last.
- Shown + `Shift+↓` / `Shift+↑`: move the cursor without switching the focused agent; down wraps last → first, up at the first agent hides the strip and clears the cursor.
- Shown + `Enter` while the cursor is on another agent: commit — `focusedAgentId` becomes the cursor and the strip stays shown; that keypress does not submit the editor. Otherwise `Enter` falls through to editor submit (`tui-shortcuts.md`).
- No agents loaded: the shift keys are a no-op.

There is no Esc-to-close and no auto-close on submit; `teamPanelVisible` survives `clearTuiState` (which does reset the cursor).

## Content

One row per agent, leader pinned first, the rest in map insertion order — `TuiState.rosterOrder` is the single shared ordering for both the cursor rule and the display. Each row is five left-aligned columns separated by two spaces; every column but the last is padded to the widest cell in the roster, and the whole row truncates to the available width:

```
▸ ★ dm-1 · dm                notify write_artifact read_artifact  task.review_passed task.failed  qwen3.5-4b  25%/128k
  researcher-1 · researcher  web_search web_fetch                 task.recorded                   qwen3.5-4b  —
```

Per row: the identity column — cursor (`▸` in `accent` on the pointed agent — cursor, else focus — a space otherwise), leader mark (`★` in `accent`; absent for non-leaders), agent key (`accent` when pointed or focused), status glyph, role plus a queue-depth tag `· q<N>` (`muted`) when the queue is non-empty; then the soul's `tools` (`muted`), its `subscribe` topics (`muted`), the model id, and the context usage `N%/<window>k` colored by `contextPercentColor` — the footer's shared formatters (`footer/context-percent.ts`). Empty columns render `—`.

**Status glyph**: `·` (`muted`) idle; a braille spinner frame derived from `Date.now() / SPINNER_INTERVAL_MS` (`accent`) busy — the same frames and interval as the working indicator; `✗` (`error`) idle with `lastStopReason === "error"`. The clock is read render-side, consistent with the reducer purity model (`tui-state.md`).

## State

`state.teamPanelVisible: boolean` (initial `false`) and `state.teamCursorAgentId: AgentId | null` (initial `null`), set by the `switchCycleAgent` cursor rule and the `commitTeamCursor` action (the ui-reducer). `clearTuiState` resets the cursor but not the visibility — the same class as `thinkingExpanded` / `toolCardsExpanded`. The view's global input listener consumes `Enter` before the editor only while `teamPanelVisible && teamCursorAgentId !== null && teamCursorAgentId !== focusedAgentId` (`components/view.ts`), so a plain submit is untouched otherwise. The strip re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`).
