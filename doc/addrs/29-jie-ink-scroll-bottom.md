# ADR 29: jie-ink Chat Render Modes (`scrollBottom`, `appendToScrollback`)

## Status

Superseded by ADR 30 (2026-07). Both render modes were deleted with jie-ink. The open question this ADR raised is answered: the pi-tui migration dropped the alternate screen entirely, so the terminal's own scrollback *is* the chat history — `appendToScrollback` is no longer needed, and `scrollBottom` was already unused. (Note: the original ADR 30 this subsumed was folded into this one during the ADR consolidation; the number 30 was reused for the migration ADR.)

## Context

Chat needs tail-anchoring (new turns slide the visible region to the bottom) and history preservation (old turns stay readable). Two jie-ink features were built for this:

- `overflow="scrollBottom"` (ADR 29 original): a Box overflow value that anchors content to the bottom of the clip rect. The naive offset trick fails because Yoga's default `flexShrink: 1` compresses children to fit a constrained column, so `contentBottom` never exceeds the box height. The implementation sets `flexShrink: 0` on direct children, re-runs `calculateLayout` on the box subtree with an `UNDEFINED` outer height to get natural tops, computes `contentBottom`, and offsets children by `-(contentBottom − boxInnerHeight)`.
- `appendToScrollback`: a third `log-update` strategy, `createAppend`, alongside `createStandard` / `createIncremental`. Standard and incremental modes erase the previous frame before redrawing — and `eraseLines(N)` reaches upward from the cursor into rows that already scrolled into the terminal scrollback, destroying history. `createAppend` never touches unchanged lines: pure appends emit only new lines, pure shrinks erase only dropped rows, streaming last-line edits rewrite only the last row, and middle changes fall back to erase-and-rewrite (chat streaming never lands there).

## Decision

Both modes exist in jie-ink. Current usage in jie-tui:

- **`scrollBottom` is unused.** The chat pane virtualizes at the app level: `chat-pane.tsx` renders a window of visible turns in a plain `overflow="hidden"` box (`chat-visible-turn.tsx`), so tail-anchoring and history are app concerns, not renderer concerns. The mode remains on the jie-ink surface; nothing consumes it.
- **`appendToScrollback: true` is enabled in `tui.tsx`, alongside `alternateScreen: true`.** Open question: the alternate screen has no scrollback buffer for the terminal to retain, so append mode's preservation property may be moot under it. Verify in a real pty (exit/unmount behaviour) in phase 2; if moot, drop `createAppend` too.

## Consequences

- The two modes are the non-selection part of jie-ink's diff against upstream ink (see `packages/jie-ink/MODULE.md`). Phase 2 attempts complete jie-ink removal (candidate replacement: `@earendil-works/pi-tui`); unused `scrollBottom` goes away with the fork, and `appendToScrollback` goes if the alternate-screen check confirms it is moot.
- If jie-tui ever needs terminal-scrollback chat again (the pi model: unbounded growth, scroll up to read history), that requires dropping `alternateScreen` — a layout decision, not a renderer one.
