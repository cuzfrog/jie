# Team panel

A togglable bottom panel giving the team-at-a-glance view — roster, per-agent status and configuration, queue depth — that the footer (focused agent, per-agent model) does not convey. `←` toggles it while the editor cursor sits at the buffer start (`tui-shortcuts.md`); while shown, plain `↑`/`↓` move the cursor between agents without switching context and `Enter` commits the pointed agent as the focused one. Hidden by default; session-only (never persisted), and preserved across `/clear` like the other view toggles.

## Layout

The panel is the last section of the single inline column (`tui-layout.md`): it renders **below the footer**, borrowing rows from the bottom of the frame, never width from the chat. pi-tui's viewport is bottom-anchored, so a taller frame scrolls the top (splash, older scrollback) off rather than pushing the panel out of view. Hidden, it renders zero rows. It is a thin full box in `borderMuted` — `┌─…─┐` top, `│` sides, `└─…─┘` bottom — with the table inset one cell inside the box; the first content row titles the columns in `dim`. The cursor glyph marks the pointed agent.

## Interaction

- `←` hidden, editor cursor at the buffer start (`state.editorCursorAtStart`): show the panel with the cursor (`state.teamCursorAgentId`) on the focused agent (the first agent when the focus is null). `←` shown: hide the panel and clear the cursor. A `←` anywhere else in the buffer stays with the editor; the footer's help-info hint swaps to the shortcut hint while the shortcut is activated (`tui-layout.md`, Footer).
- Shown + `↓` / `↑`: move the cursor without switching the focused agent, cycling both ways (last → first and first → last). The editor's prompt-history walk yields while the panel is shown; while the autocomplete popup is open, plain arrows navigate the popup instead (`tui-shortcuts.md`).
- Shown + `Enter` while the cursor is on another agent: commit — `focusedAgentId` becomes the cursor and the panel stays shown; that keypress does not submit the editor. Otherwise `Enter` falls through to editor submit (`tui-shortcuts.md`).
- No agents loaded: `←` is a no-op.

There is no Esc-to-close and no auto-close on submit; `teamPanelVisible` survives `clearTuiState` (which does reset the cursor).

## Content

One row per agent, leader pinned first, the rest in map insertion order — `TuiState.rosterOrder` is the single shared ordering for both the cursor rule and the display. Columns, left to right: **agent**, **ctx**, **tools**, **subscribe** — left-aligned, each padded to the widest cell across the title row and the roster — then **model**, right-aligned flush to the panel's right border. Every row is padded or truncated to the available width:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ agent           ctx       tools                                subscribe                                                 model │
│ ▸ dm-1 leader   25%/128k  notify read_artifact write_artifact  task.review_passed task.failed  (lm-studio) qwen3.5-4b | medium │
│   researcher-1  —         web_search web_fetch                 task.recorded                   (lm-studio) qwen3.5-4b | medium │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Per row: the identity column — cursor (`▸` in `accent` on the pointed agent — cursor, else focus — a space otherwise), agent key (`accent` when pointed or focused; the key already carries the role, so the role is not repeated), a `leader` label (`dim`) for the leader, status glyph, and a queue-depth tag `q<N>` (`muted`) when the queue is non-empty; then the context usage `N%/<window>k` colored by `contextPercentColor` (`footer/context-percent.ts`), the soul's `tools` (`muted`), its `subscribe` topics (`muted`), and the model segment `(provider) modelId | effort` — the same `formatModelSegment` the footer uses (`footer/model-segment.ts`). Empty columns render `—`. The row layout is `renderTeamTable` (`components/team-table.ts`).

**Adaptive width.** The identity and model columns always render. When the natural row width exceeds the available width, the middle columns drop right to left — `subscribe`, then `tools`, then `ctx` (their titles drop with them) — and if identity plus model still overflow, the model segment truncates to fit.

**Status glyph**: none idle; a braille spinner frame derived from `Date.now() / SPINNER_INTERVAL_MS` (`accent`) busy — the same frames and interval as the working indicator; `✗` (`error`) idle with `lastStopReason === "error"`. The clock is read render-side, consistent with the reducer purity model (`tui-state.md`).

## State

`state.teamPanelVisible: boolean` (initial `false`), `state.teamCursorAgentId: AgentId | null` (initial `null`), and `state.editorCursorAtStart: boolean` (initial `true`) — the first two set by the `toggleTeamPanel` action, the `switchCycleAgent` cursor rule, and the `commitTeamCursor` action, the last by `Actions.setEditorCursorAtStart` (the ui-reducer). The editor syncs `editorCursorAtStart` after every content change and every input it handles (`editor/jie-editor.ts`); `clearTuiState` resets the cursor but not the visibility nor this flag — the same class as `thinkingExpanded` / `toolCardsExpanded`, and `/clear` does not move the editor cursor. The view's global input listener consumes `←` before the editor only while `editorCursorAtStart` and no autocomplete popup is showing (dispatching `toggleTeamPanel`), consumes `Enter` before the editor only while `teamPanelVisible && teamCursorAgentId !== null && teamCursorAgentId !== focusedAgentId`, and routes plain `↑`/`↓` to the cursor rule only while `teamPanelVisible` and no autocomplete popup is showing (`components/view.ts`), so a plain submit and the editor's history walk are untouched otherwise. While the shortcut is activated (`state.teamId !== null && state.editorCursorAtStart`) the footer's help-info hint swaps to the shortcut hint (`tui-layout.md`, Footer). The panel re-reads state on every render and needs no subscription of its own: every dispatched action already triggers a full re-render through the chat sync (`tui-layout.md`).
