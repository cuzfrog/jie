# ADR 27: TUI Editor is One Line by Default; Footer Pinned via flexGrow

## Status

Accepted. Replaces the 2026-07 TUI prototype's two layout decisions with the user-confirmed design:

1. `Layout` (`packages/jie-tui/components/layout.tsx`) declares three bands — body (`flexGrow={1}`), editor (natural height), footer (natural 2 lines). The footer is therefore pinned to the last two rows of the terminal for any `rows` value.
2. `Editor` (`packages/jie-tui/components/panel/editor.tsx`) is a single content row + top/bottom borders by default, grows by one row for every `\n` typed, and opens the left/right sides (no `│`). The OS terminal caret is positioned via Ink's `useCursor()` hook each render.

`doc/specs/jie-platform/ui/tui-layout.md` reflects both decisions.

## Context

The 0.2 prototype (recorded in `tui-layout.md` prior to this change) reserved a static editor height of `max(5, floor(rows * 0.3)) + 2 = 9` lines on a 30-row terminal — roughly 30% of the screen — and wrapped the editor in a `borderStyle="single"` box that drew all four sides. The `Layout` component then anchored the footer with two fixed-height spacer rows above and below, plus an explicit pre-footer border row. Three user-visible defects emerged:

1. **Footer not at the very bottom.** The trailing spacer rows after the footer pushed the footer two rows above the terminal's last row. On a 30-row terminal the footer landed on rows 26–27 instead of 28–29, with rows 28–29 blank.
2. **No cursor in the editor.** The editor rendered plain `<Text>` content; the OS terminal caret was never positioned, so the user could not see where the next character would land.
3. **Editor was a multi-row box by default.** Even for a single-line prompt, the bordered box was 9 rows tall — visually heavy, especially compared to chat-pane style (which is also unbounded vertically). Inserting a newline made the box grow, but the baseline visual was already wrong.

The previous spec was internally consistent with the implementation but disagreed with the user. The fix is therefore an intentional design correction, not a code smell.

## Decision

### 1. `Layout` pins the footer via `flexGrow`

```tsx
<Box flexDirection="column" width={columns} height={rows}>
  <Box flexDirection="row" flexGrow={1} width="100%">
    {railVisible ? <AgentsRail /> : null}
    <ChatPane />
  </Box>
  <Box width="100%"><Editor /></Box>
  <Footer cwd={...} gitBranch={...} gitDirty={...} />
</Box>
```

- The body box has `flexGrow={1}` and absorbs whatever vertical space remains after the editor (natural height) and footer (2 fixed rows). The footer therefore lands on the terminal's last two rows for any `rows` value with no manual arithmetic.
- The pre-footer border spacer (`height={FOOTER_BORDER_LINES}`) and post-footer spacer (`height={FOOTER_LINES}`) are removed — they were only needed when the editor was forced to a static fraction of the terminal. With natural heights, no spacer belongs in `Layout`.
- `editorHeightFor(rows)` and `bodyHeightFor(rows, editorHeight)` are deleted along with the `FOOTER_LINES`, `EDITOR_BORDER_LINES`, and `FOOTER_BORDER_LINES` constants.

### 2. `Editor` is one line by default, grows on `\n`, top + bottom borders only

```tsx
<Box borderStyle="single"
     borderTop={true} borderBottom={true}
     borderLeft={false} borderRight={false}
     borderColor={pickColor("borderMuted")}
     width="100%">
  <Box flexDirection="column" paddingX={1}>
    {placeholder ? <Text color={pickColor("muted")}>{PLACEHOLDER}</Text>
                  : lines.map((line, i) => <Text key={i}>{line}</Text>)}
  </Box>
</Box>
```

- Inky's `render-border` only emits border characters when `borderStyle` is non-empty, so the per-side boolean flags (which are declared on `Box.d.ts` but gated on `borderStyle` in `render-border.js`) only take effect with a non-empty style. The combination above is the only Ink-supported way to render "top + bottom only".
- Empty buffer renders one `<Text>` of the placeholder. As the user types, each `\n` adds one `<Text>` row. The editor's box height therefore grows by one row per newline; it never reserves a static fraction of the terminal.
- `paddingX={1}` is constant (`EDITOR_PADDING_X`) so the cursor x-coordinate math stays in one place.

### 3. `Editor` positions the OS caret via `useCursor`

```tsx
const { rows } = useWindowSize();
const { setCursorPosition } = useCursor();
setCursorPosition(caretPositionForCursor(buffer, rows));
```

with the pure function inlined into `panel/editor.tsx` and re-exported as `_caretPositionForCursor` for testing:

```ts
function caretPositionForCursor(buffer: string, totalRows: number): CaretPosition {
  const lines = buffer.split("\n");
  const lastLineIndex = lines.length - 1;
  const currentLine = lines[lastLineIndex] ?? "";
  const x = EDITOR_PADDING_X + currentLine.length;
  const lastContentRow = Math.max(0, totalRows - FOOTER_LINES - EDITOR_BORDER_LINES);
  const y = Math.max(1, lastContentRow + 1 - (lines.length - 1 - lastLineIndex));
  return { x, y };
}

export { caretPositionForCursor as _caretPositionForCursor };
```

The function was originally drafted in a separate `panel/editor-cursor.ts`; the user folded it back into `editor.tsx` so the cursor math stays next to its only caller. The `_caretPositionForCursor` re-export is the "visible for testing" seam — the underscore signals an internal export, not a public API.

- Ink's `setCursorPosition({ x, y })` uses coordinates **relative to the Ink output origin**, which is the **top** of the visible output (per `ink/build/hooks/use-cursor.js`'s docstring "relative to the Ink output origin" and `ink/build/cursor-helpers.js`'s `buildCursorSuffix`: `moveUp = visibleLineCount - cursorPosition.y` means the cursor moves up by `visibleLineCount - y` lines from the post-output row, landing on **1-indexed** row `y`). In full-screen mode (`isFullscreen = outputHeight >= viewportRows`) Ink does **not** append a trailing `\n`; after writing the frame, the cursor sits on the last written row, and `moveUp = N - y` lands on 1-indexed row `y`. So `y` is **1-indexed**: the trailing content row of a single-line editor on a `rows`-row terminal is at row `rows - 3` (1 content + 2 borders + 2 footer = 5 rows of chrome below the top, 0-indexed row `rows - 4`). The very first version of this function set `y = lastLineIndex` (treating `y` as a 0-indexed row count from the top) which placed the cursor at the top of the screen — the user-visible bug this ADR originally fixed. A subsequent off-by-one regression (passing the 0-indexed `lastContentRow` straight to `setCursorPosition` as if it were 1-indexed) put the caret on the editor's top border — fixed by `+1` in the formula and pinned by the regression tests below.
- Empty buffer now positions the caret on the placeholder line (column 1, the start of the prompt area) instead of suppressing it. The original suppression was wrong: it forced the user to type a character before the caret appeared. With the cursor visible from the start, the editor's affordance matches the user's expectation.
- `useWindowSize()` provides the actual terminal `rows` (and re-renders on resize). `ink-testing-library` does not emit escape sequences to a pipe, so the hook's effect is invisible in tests; the pure `caretPositionForCursor` is tested in isolation in `editor.test.tsx` instead. On a real TTY the hook materializes as `showCursorEscape` + `ansiEscapes.cursorTo(x)` + `ansiEscapes.cursorUp(moveUp)` after every render.
- The arithmetic formula is correct **only when `useWindowSize().rows` matches the visible terminal height**. Some terminals reserve a row (e.g. for a status line or the cursor's last-known position) and report `rows = visibleRows - 1`, which produces the same 1-row-off bug this ADR fixed. Claude Code solves this with a forked Ink whose `onRender` resolves the editor's actual Yoga rect (see `doc/specs/jie-platform/ui/tui-claude-code-reference.md`); jie-tui cannot adopt that pattern on stock Ink without forking or vendoring. The diagnostic path is documented in that reference spec; the v0.2 answer is the formula with regression coverage.

### 4. Tests pin the new shape

`packages/jie-tui/components/layout.test.tsx` and `packages/jie-tui/components/panel/editor.test.tsx` add coverage; all run red against the prior code and green with the change.

`layout.test.tsx` (+2):
- `Layout > pins the footer to the last two rows of the terminal` — finds `/tmp/proj` in the rendered frame and asserts its row index equals `rows - 2`.
- `Layout > editor content height equals 1 plus the number of newlines in the buffer` — finds the placeholder row, locates the surrounding `─` border rows, and asserts the content row count is `1`.

`editor.test.tsx` (+6 cursor tests, in addition to the prior 3 layout/visual tests):
- `Editor > does not render left or right border characters` — asserts that no rendered line starts or ends with `│`.
- `Editor > renders exactly one content row when buffer is a single empty line` — locates the placeholder between two `─` border rows and asserts the content row count is `1`.
- `Editor > grows the content height when buffer contains newlines` — asserts all lines of a multi-line buffer render.
- `caret y for an empty buffer on a 30-row terminal is on the placeholder row, not row 0` — `{}` → `{x: 1, y: 27}`. Pins the empty-buffer invariant (no suppression); the original bug this ADR fixed would have placed the caret on row 0, and the off-by-one regression would have placed it on row 26 (the editor's top border).
- `caret y for a single-line buffer on a 30-row terminal is on the content row above the bottom border` — `"hello"` → `{x: 6, y: 27}`. x is `paddingX + buffer.length`; y is 1-indexed (`rows - footerLines - borderLines = rows - 3` for a single-line editor).
- `caret y for a multi-line buffer places the caret on the last line above the bottom border` — `"first\nsecond\nthird"` → `{x: 6, y: 27}`. The trailing line is the only one that drives y; prior lines do not.
- `caret y scales with terminal rows — caret stays just above the bottom border` — `"hi"` at `rows = 12` → `{x: 3, y: 9}`. Confirms `y = rows - 3` (1-indexed) for the single-line case across row counts.
- `caret x for a multi-line buffer counts only the trailing line's length` — `"aaaaa\nbbb"` → `{x: 4, y: 27}`. x is derived from the trailing segment, not the longest line.
- `caret on the trailing line of a multi-line buffer sits at the same row as a single-line buffer of the trailing text` — `_caretPositionForCursor("first\nsecond", 30) === _caretPositionForCursor("second", 30)`. Pins the equivalence: rendering `"first\nsecond"` and editing `"second"` produce the same caret position.

## Rationale

- **A pinned footer matches user intuition.** The terminal is a vertical scrollback; the user expects the most recent status (identity / model / shortcut hint) at the bottom edge. A footer floating mid-screen is jarring. `flexGrow` is the right tool: there is nothing to compute once editor height is natural.
- **A thin editor matches input reality.** Most prompts are one line. Reserving a 9-line box encourages the user to multi-line-wrap by default (filling with whitespace); a 1-line strip matches what a single-line prompt feels like in Notion, iMessage, or pi-tui. Multi-line growth still works for paste-in prompts that contain `\n`.
- **Open left/right borders match the design language.** pi-tui and most CLI TUIs use horizontal rules as separators; vertical `│` columns on the editor implied it was a column-adjacent box (which it isn't — it spans the full width under the rail).
- **`useCursor` is the OS-correct primitive.** A reverse-video block caret is a hack: it lives inside the rendered frame and changes how each layout pass sees the editor. `setCursorPosition` moves the OS caret outside the frame's character grid; layout is unaffected, and IME composition works. The visual is the same on terminals that render the caret; the implementation is more correct everywhere.
- **`paddingX=1` is fixed, not derived.** The editor does not need to know its own width to compute x because `Layout` always passes a `width="100%"` band. The caret's column is `paddingLeft + lastLineLength` — a constant plus the buffer's last segment, both of which the editor already knows.

## Consequences

- `packages/jie-tui/components/layout.tsx` — three-band layout; `editorHeightFor`, `bodyHeightFor`, `FOOTER_LINES`, `EDITOR_BORDER_LINES`, `FOOTER_BORDER_LINES` removed.
- `packages/jie-tui/components/panel/editor.tsx` — `borderStyle="single"` with `borderTop/borderBottom` only, `borderLeft/Right={false}`; `useCursor().setCursorPosition(caretPositionForCursor(buffer, rows))` on every render; `placeholder` and `lines` derived once per render; the cursor-y math lives in the in-file pure function `caretPositionForCursor(buffer, totalRows)` (`y = lastContentRow + 1 - …`, clamped to `Math.max(1, …)` to keep the caret on a valid row for tiny terminals), re-exported as `_caretPositionForCursor` for testing. The layout constants `EDITOR_PADDING_X`, `EDITOR_BORDER_LINES`, `FOOTER_LINES` are inlined next to it. The sealed file was updated; no new public exports cross the file's seam (only the `_`-prefixed test-only re-export, which is itself an internal export convention).
- `doc/specs/jie-platform/ui/tui-layout.md` — "Bottom strip" describes three bands, editor height is 1 + newlines, footer is pinned via `flexGrow`. The "Cursor" line item in the Editor section corrects the earlier inverted-convention error: `y` is the row index from the **top** of the visible output, computed from `rows - footerLines - borderLines - 1` for the trailing line, and the empty buffer no longer suppresses the caret.
- `doc/specs/jie-platform/ui/tui-claude-code-reference.md` — new sibling spec documenting Claude Code's `CursorDeclarationContext` + `nodeCache` cursor architecture (forked Ink) and why jie-tui cannot adopt it on stock Ink; the editor's arithmetic formula is the pragmatic alternative.
- `packages/jie-tui/components/layout.test.tsx` (+2 tests), `packages/jie-tui/components/panel/editor.test.tsx` (+3 layout/visual tests + 6 cursor tests) — both files are sealed but the added tests are pure additions to the file's `describe` block; no new exports cross the file's seam.
- The pre-existing "30% of rows" editor-height formula in `tui-layout.md` is removed; that decision is now an artifact of this ADR.

## Open questions

- If the editor ever needs to scroll its own content (a paste-in multi-line buffer longer than the available space), today's rendering will push the editor's height past the terminal's bottom. v0.2 scope is single-pane chat with the user scrolling history; this is out of scope until paste-in > 10 lines becomes common.
- `caretPositionForCursor` assumes the editor is the bottom-most Ink band directly above a 2-row footer. If a future change adds a second band below the editor (e.g. a tooltip or status-line variant), the editor's `y` computation needs to be re-anchored. The fix at that point is to lift the anchor offset through context, or to extend `caretPositionForCursor` to take a `contentAreaTopRow` parameter.
- The `lastLineIndex` parameter of `caretPositionForCursor` is currently always `lines.length - 1` (the trailing line), because the Editor only supports the trailing-line caret. When in-line cursor navigation (left/right arrows) is added, the function will need an explicit `caretLineIndex` and `caretColumn` argument. Today's API leaves room for that — the formula already factors in the line index.
- The arithmetic formula depends on Ink's `useCursor()` semantics holding (1-indexed `y`, no trailing `\n` in full-screen mode). If a future Ink release changes either convention, the `+1` and the no-trailing-newline assumption need to be re-verified. The longer-term robust fix is Claude Code's `CursorDeclarationContext` pattern, documented in `tui-claude-code-reference.md`; jie-tui cannot adopt it without forking or vendoring Ink, so the arithmetic formula remains the pragmatic v0.2 answer.
