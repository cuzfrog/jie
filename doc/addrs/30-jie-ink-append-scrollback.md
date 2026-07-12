# 30 — jie-ink `appendToScrollback` render mode for chat history preservation

## Status

Accepted. Implemented and covered by `packages/jie-ink/src/log-update.test.tsx` (append rendering suite). Enabled by default in `packages/jie-tui/tui.tsx`.

## Context

After ADR 29 introduced `overflow="scrollBottom"` to keep the latest turn visible at the bottom of the chat viewport, the user reported a follow-up issue: even though the terminal itself could scroll up, history messages had been truncated and could not be read. The local Tailwind-on-Ink renderer was always rewriting the previous frame via `ansiEscapes.eraseLines(N)` before drawing the new one. `eraseLines(N)` from the current cursor position reaches **upward** into rows above the visible frame — including rows that had already been scrolled into the terminal's scrollback buffer. The end result: scrollback contained only whatever happened to be in the cursor's `N`-row reach, while rows farther up were overwritten with `[2K` blanks.

The naive fix — "stop using `overflow=\"scrollBottom\"`, let the chat grow unbounded and rely on terminal scrollback" — is the model `pi` uses. But jie-ink's renderer actively destroys scrollback on every paint, so adopting pi's model required either forking ink or adding a new render mode that preserves scrollback.

## Root cause

`packages/jie-ink/src/log-update.ts` has two render strategies, `createStandard` and `createIncremental`. Both clear the previous frame before redrawing:

- `createStandard` writes `eraseLines(previousLineCount) + str` on every non-identical render. The cursor rewinds to the top of the previous frame and then erases — touching every row the previous frame occupied, including any that scrolled into scrollback.
- `createIncremental` does line-by-line diffs, but still emits `cursorUp(previousLines.length - 1)` followed by per-line overwrites. The `cursorUp` itself reaches into scrollback and any unchanged lines that have already scrolled past the visible region are still painted over by `cursorTo(0) + eraseEndLine`.

Neither mode is suitable for chat history preservation.

## Decision

Add a new render mode `appendToScrollback: true` to `RenderOptions`. The mode plugs into `logUpdate.create` as a third strategy, `createAppend`, alongside `createStandard` and `createIncremental`. It is mutually exclusive with `incrementalRendering`.

`createAppend` classifies each non-identical render into one of four paths, all sharing the property that **unchanged lines are never touched**:

1. **Pure append** (`visibleCount >= previousVisible` and all common lines match). Cursor is already at the slot below the previous frame's last visible line. Emit only the new lines as `nextLines[previousVisible..visibleCount-1].join('\n')` (plus a trailing `\n` if the input had one). Unchanged lines stay in scrollback.
2. **Pure shrink** (`visibleCount < previousVisible` and all kept lines match). Cursor at the old slot. Emit `eraseLines(previousVisible - visibleCount + 1)` to clear the dropped rows. The kept lines and any rows above are preserved.
3. **Last-line-only change** (streaming in-place edit). `cursorUp(1)` to the last visible row, `eraseEndLine` + new content, `cursorDown(1) + cursorTo(0)` back to the slot. Everything above stays untouched.
4. **Anything else** (middle changes, mixed grow+shrink). Fall back to the standard erase-and-rewrite sequence. Chat streaming never lands here, so scrollback is still preserved in practice.

The dispatcher in `ink.tsx` suppresses `shouldClearTerminalForFrame` when `appendToScrollback` is enabled — that path also clears the terminal on resize-shrinks and unmounts, which would clobber scrollback. `clear()`, `done()`, and `sync()` are all no-write or state-reset only in append mode, for the same reason.

## Consequences

- `jie-tui` enables `appendToScrollback: true` in `tui.tsx`. Combined with `overflow="scrollBottom"` from ADR 29, the chat pane grows without bound and the terminal scrollback retains every turn. The editor and footer remain anchored at the bottom of the visible region via the existing layout (`EDITOR_ROWS=8`, `FOOTER_ROWS=2`).
- The new mode is **opt-in** (default `false`). The `incrementalRendering` mode is preserved unchanged for callers that want line-by-line diffing without the append-only constraint.
- A user-facing limitation: scrolling back via the terminal's scrollbar is the only navigation. Page-up to reveal older turns is not a feature of this ADR — `scrollBottom` is still a tail-anchor.
- The middle-change fallback (path 4) loses scrollback in that rare case. Acceptable: chat never edits a middle line in place.

## Open questions / follow-ups

- If middle-edit chat flows become a real requirement (e.g., tool-call card updates mid-conversation), extend `createAppend` with a true line-by-line diff that targets changed rows by absolute cursor moves while leaving unchanged rows alone. Out of scope here.
- The current `Output` class still clips writes outside the Yoga-computed rect (negative or `y + offsetY >= height`). In append mode the chat pane's natural height exceeds its allotted box, so the renderer relies on the existing `scrollBottom` logic to position content correctly. If a future layout uses `appendToScrollback` without `overflow="scrollBottom"`, the clip behavior needs revisiting.
