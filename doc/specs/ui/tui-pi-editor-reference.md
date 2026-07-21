# TUI Pi Editor Reference

A self-contained reference on how pi's `@earendil-works/pi-tui` `Editor` is implemented. Each section explains the *mechanism* (data structures, algorithms, formulas, and a sketch of the implementation) well enough that an agent can re-implement equivalent logic without opening the pi source. File paths are given as provenance, not as a substitute for the explanation.

The `Editor` class lives at `packages/tui/src/components/editor.ts` (2333 LOC) and is wrapped by `packages/coding-agent/src/modes/interactive/components/custom-editor.ts` (`CustomEditor extends Editor`) to add app-level keybindings and dynamically replaceable handlers (`onEscape`, `onCtrlD`, `onPasteImage`, `onExtensionShortcut`). The component is rendered by the `TUI` differential renderer in `packages/tui/src/tui.ts`, not by Ink — pi uses an imperative `render(width) → string[]` API, not React, so most of the cursor logic lives in plain TypeScript classes.

This doc is the editor-side companion to `tui-pi-reference.md` (theme tokens, separator characters, font treatments) and to `tui-claude-code-reference.md` (Claude Code's cursor-placement architecture, fork-of-Ink). Where the two designs disagree, jie-tui should learn from both.

## Menu

1. [Architecture: the imperative `Component` model](#1-architecture-the-imperative-component-model)
2. [State shape and lifecycle](#2-state-shape-and-lifecycle)
3. [Text model: lines + cursor](#3-text-model-lines--cursor)
4. [Visible-width math: graphemes, CJK, emoji](#4-visible-width-math-graphemes-cjk-emoji)
5. [Layout: word-wrap, padding, scrolling](#5-layout-word-wrap-padding-scrolling)
6. [Cursor rendering: ANSI inverse, IME hook](#6-cursor-rendering-ansi-inverse-ime-hook)
7. [Insertion: characters, paste, multi-line](#7-insertion-characters-paste-multi-line)
8. [Deletion: grapheme-aware, kill-ring](#8-deletion-grapheme-aware-kill-ring)
9. [Cursor movement: grapheme, word, jump](#9-cursor-movement-grapheme-word-jump)
10. [Vertical cursor and the sticky-column decision table](#10-vertical-cursor-and-the-sticky-column-decision-table)
11. [Undo: fish-style coalescing](#11-undo-fish-style-coalescing)
12. [Kill ring and yank-pop](#12-kill-ring-and-yank-pop)
13. [Prompt history and up/down navigation](#13-prompt-history-and-updown-navigation)
14. [Multi-line editing: line split, merge, IME submit](#14-multi-line-editing-line-split-merge-ime-submit)
15. [Autocomplete: provider, debounce, paste-marker awareness](#15-autocomplete-provider-debounce-paste-marker-awareness)
16. [Large-paste markers as atomic segments](#16-large-paste-markers-as-atomic-segments)
17. [Keybinding table](#17-keybinding-table)
18. [Customization surface: `EditorComponent`, `CustomEditor`, factories](#18-customization-surface-editorcomponent-customeditor-factories)
19. [What jie-tui can and cannot take](#19-what-jie-tui-can-and-cannot-take)

---

## 1. Architecture: the imperative `Component` model

Pi's TUI is **not** Ink. It is an imperative custom renderer (`TUI extends Container`, `packages/tui/src/tui.ts:295`) that walks the component tree on every render and diffs each line of output against the previous frame, writing only the cells that changed.

Components implement:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;     // Kitty protocol key-release events
  invalidate(): void;             // called on theme changes
}
```

The `Editor` class implements `Component` and `Focusable` (`editor.ts:252`). `render(width)` is the entire visual pipeline: it lays out the logical text into visual lines, draws top/bottom borders with possible scroll indicators, draws each line with a fake ANSI inverse-video cursor, optionally draws the autocomplete dropdown, and returns a `string[]` (one per row). The TUI diffs the array against the previous frame and emits only changed cells.

`handleInput(data)` receives the raw ANSI escape sequence for the keypress (e.g. `"\x1b[A"` for Up, `"\x17"` for Ctrl+W, `"\x1b[3~"` for Delete). It dispatches to the right mutator by matching against a `KeybindingsManager` (`packages/tui/src/keybindings.ts:97`), which holds the keybinding registry (`TUI_KEYBINDINGS` at `keybindings.ts:64`). The manager resolves each `tui.editor.*` id to one or more default `KeyId`s, and a user may override individual keys via `settings.json`.

**Why this matters for jie-tui:** pi's `Editor` is one ~2300-line class with all cursor/undo/kill/history/autocomplete logic inside it. jie-tui's native Ink editor (`components/editor/`, see §19) deliberately implements the cursor/multi-line/grapheme core itself and punts the rest (§19.5). The pragmatic lesson: cursor logic is *the* place where a fully-functional editor differs from a workable one, and it is too big to retrofit once the rest of the app is built.

### 1.1 The `Focusable` interface and the IME hook

```ts
interface Focusable { focused: boolean; }   // tui.ts:104
```

When a `Focusable` component gains focus, the TUI sets `focused = true` on it. The component emits a zero-width `CURSOR_MARKER` (`"\x1b_pi:c\x07"`, an APC escape, `tui.ts:120`) before its fake-cursor render. The TUI scans the rendered output for that marker, computes the marker's absolute `(x, y)` from the line index, and emits a `CSI row;col H` to position the *hardware* terminal cursor there. The hardware cursor is normally hidden (so it does not double up with the fake inverse cursor), but terminals that track IME candidate windows via the hardware cursor's position need it visible — toggled by `PI_HARDWARE_CURSOR=1` (`tui.md:55`).

This is pi's answer to "the cursor must be in the right place for IME". Claude Code solves the same problem differently, by forking Ink (see `tui-claude-code-reference.md` §1.3). Both approaches work; pi's is portable across all terminals because the marker is just an ANSI/APC sequence embedded in `render()` output.

## 2. State shape and lifecycle

```ts
interface EditorState {            // editor.ts:202-206
  lines: string[];                 // each entry is one logical line
  cursorLine: number;              // index into lines
  cursorCol: number;               // UTF-16 code-unit index, NOT grapheme index
}
```

The Editor's *instance* holds more than `EditorState`. Notable fields:

| Field | Purpose |
| --- | --- |
| `state: EditorState` | Authoritative text + cursor |
| `tui: TUI` | Back-reference for `requestRender()` and terminal metrics |
| `theme: EditorTheme` | `borderColor`, `selectList` |
| `paddingX: number` | Inset padding (default 0; configurable via `setPaddingX`) |
| `lastWidth: number` | Last `render(width)` width, used for cursor vertical moves |
| `scrollOffset: number` | Visual scroll offset for tall content |
| `borderColor: (str) => string` | Mutable border-color function (driven by bash-mode / thinking-mode) |
| `history: string[]`, `historyIndex: number`, `historyDraft: EditorState \| null` | Prompt history (see §13) |
| `undoStack: UndoStack<EditorState>` | Snapshots for undo (see §11) |
| `killRing: KillRing` | Emacs-style kill/yank buffer (see §12) |
| `lastAction: "kill" \| "yank" \| "type-word" \| null` | Drives kill accumulation and undo coalescing |
| `jumpMode: "forward" \| "backward" \| null` | Pending-character state for `Ctrl+]` / `Ctrl+Alt+]` |
| `preferredVisualCol: number \| null` | Sticky column for vertical moves (see §10) |
| `snappedFromCursorCol: number \| null` | Pre-snap cursor for vertical moves after paste-marker snap |
| `pastes: Map<number, string>`, `pasteCounter: number` | Large-paste registry (see §16) |
| `pasteBuffer: string`, `isInPaste: boolean` | Bracketed-paste-mode state |
| `autocompleteProvider?: AutocompleteProvider` | Optional autocomplete provider |
| `autocompleteTriggerCharacters: string[]`, `autocompleteTriggerPattern: RegExp` | Default `["@", "#"]`; provider can extend |
| `autocompleteList?: SelectList`, `autocompleteState: "regular" \| "force" \| null`, `autocompletePrefix: string` | Autocomplete UI state |
| `autocompleteAbort?: AbortController`, `autocompleteDebounceTimer?`, `autocompleteRequestTask`, `autocompleteStartToken`, `autocompleteRequestId` | Async-cancellation machinery |
| `onSubmit?: (text: string) => void` | Submit callback |
| `onChange?: (text: string) => void` | Text-change callback (fires after every mutation) |
| `disableSubmit: boolean` | Extension switch (e.g. when a confirm dialog is up) |
| `focused: boolean` | Set by TUI |

**Why no React state?** Pi's `Editor` is a long-lived imperative object, not a function component. There is no per-keystroke re-render — the Editor mutates `this.state` and calls `tui.requestRender()`, which schedules a single coalesced frame. This avoids the React-state-update-per-keystroke cost and lets the editor synchronize many fields (cursor, scroll, undo, autocomplete) without spurious renders.

### 2.1 The `onChange` contract

`onChange(text)` is invoked after every mutation that changes the text: insertion, paste, backspace, forward delete, delete-word, delete-to-line-start/end, undo, history walk, `setText`, autocomplete-apply. `setText` is the only path that pushes an undo snapshot on programmatic input (`editor.ts:1010`); every other mutator is responsible for its own undo push before mutation. The `onChange` callback fires once per logical mutation, not once per keystroke for coalesced input.

## 3. Text model: lines + cursor

Text is stored as `state.lines: string[]` (one entry per logical line). Newlines are *implicit* in the array boundaries, never characters inside `lines[i]`. `getText()` returns `lines.join("\n")`; `setText(text)` normalizes the input first.

Normalization (`normalizeText`, `editor.ts:1029`):

- `\r\n` → `\n`
- `\r` → `\n`
- `\t` → `"    "` (four spaces)

There is **no tab-stop rendering** — tabs are always expanded to four spaces at the data layer. jie-tui's spec currently treats `\t` as one cell; if we adopt this model we will need a tab-stop decision (see §19).

### 3.1 Cursor coordinates

`cursorCol` is a **UTF-16 code-unit index** into `lines[cursorLine]`, not a grapheme index. The cursor sits *between* characters: `cursorCol = 0` is before the first character; `cursorCol = lines[i].length` is past the last. Insertion splices `before = slice(0, col)` + `char` + `after = slice(col)` and advances `col` by `char.length`. This is the standard editor-cursor convention.

Grapheme awareness kicks in only at the *boundary* level: the editor segments only the slice `before` (or `after`) when computing "how many code units is the grapheme before the cursor?" for backspace, forward-delete, and word movement. The cursor itself stays at code-unit granularity — so on a multi-codepoint grapheme cluster like `👨‍👩‍👧‍👦` (which is 11 UTF-16 code units), cursor coordinates can land inside the cluster, but no editing operation will split it: backspace removes the whole cluster, forward-delete removes the whole cluster, word-jump treats it as one unit.

This matters because `Intl.Segmenter({ granularity: "grapheme" })` is the canonical source. Pi does **not** segment the whole line eagerly; it segments only the slices near the cursor. For a 1 KB line the segmentation cost per keystroke is O(visible width of the slice), not O(line length).

## 4. Visible-width math: graphemes, CJK, emoji

`visibleWidth(str)` (`packages/tui/src/utils.ts:216`) is the function every layout, cursor, and selection call must use to map "logical cells" to "terminal columns". Its job: tell us how many terminal columns `str` occupies.

### 4.1 Fast paths

```ts
if (str.length === 0) return 0;
if (isPrintableAscii(str)) return str.length;   // (utils.ts:78)
```

`isPrintableAscii` (`utils.ts:78-86`) walks the string checking that every code unit is `0x20..0x7e`. For pure-ASCII strings (the common case), `visibleWidth` is O(n) with no allocation. ASCII printable → 1 cell per code unit, no exceptions.

### 4.2 Cache

```ts
const WIDTH_CACHE_SIZE = 512;
const widthCache = new Map<string, number>();
```

Up to 512 strings (LRU-by-insertion: old entries are dropped on overflow via `widthCache.set(s, n)` after `widthCache.size >= WIDTH_CACHE_SIZE` deleting the first key — see `utils.ts:267-273`). The cache keys by string identity, so two equal strings share a result. Lines, segments, and the autocomplete dropdown items all hit the cache.

### 4.3 Cleaning before segmenting

After the fast path, `visibleWidth` first strips ANSI / OSC / APC escape sequences in one pass (`extractAnsiCode`, `utils.ts:222-247`), and converts tabs to three spaces (`utils.ts:250-252`). The strip is *output-shape* aware: CSI sequences, OSC 8 hyperlinks, and pi's own `CURSOR_MARKER` APC are all stripped to zero width. This is how `render()` can emit styled text and `visibleWidth` can still compute the cell count correctly.

### 4.4 Grapheme segmentation and width assignment

The cleaned string is segmented with `Intl.Segmenter(undefined, { granularity: "grapheme" })`. Each segment is passed to `graphemeWidth(segment)` (`utils.ts:180-214`) which assigns:

- ASCII printable → 1
- `eastAsianWidth(cp)` for EastAsian-Wide / EastAsian-Fullwidth (CJK, fullwidth Latin, emoji presentation when not VS16)
- `\uFE0F` (variation selector 16, "emoji presentation") → forces the prior code point to wide
- Zero-width characters (marks, format, controls) → 0
- Emoji clusters → 2 (with heuristic via `couldBeEmoji`, `utils.ts:32-43`)
- Combining marks following a base → 0
- Halfwidth Katakana voicing marks (`\u0e33`, `\u0eb3`) → 1

### 4.5 CJK break rule

For wrap and word-jump, `cjkBreakRegex` (`utils.ts:48`) is:

```ts
/[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}
  \p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}
  \p{Script_Extensions=Bopomofo}]/u
```

CJK characters may break between any two adjacent CJK characters; this is what allows `wordWrapLine` to wrap mid-word for CJK input but only at whitespace / punctuation boundaries for Latin input.

### 4.6 Punctuation word

`PUNCTUATION_REGEX` (`utils.ts:800`) is:

```ts
/[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/   // ASCII punctuation
```

Word navigation treats a run of punctuation as a single "non-word, non-whitespace" segment between words. This is the convention bash/readline use.

## 5. Layout: word-wrap, padding, scrolling

`render(width)` (`editor.ts:451-578`) builds the visible output. Steps:

1. Compute `contentWidth = max(1, width - paddingX * 2)` and `layoutWidth = max(1, contentWidth - (paddingX ? 0 : 1))` (`editor.ts:455-460`). The `-1` when `paddingX === 0` reserves one column for the cursor block at end-of-line; when padding is non-zero the cursor may overflow into the padding region (`cursorInPadding` flag).
2. `this.lastWidth = layoutWidth` (`editor.ts:463`) — used by vertical cursor moves so the wrap width matches the wrap width used during the last render.
3. Call `layoutText(layoutWidth)` to convert logical lines to `LayoutLine[]`.
4. Compute `maxVisibleLines = max(5, floor(terminalRows * 0.3))` — at most 30 % of the terminal height, minimum 5 lines.
5. Adjust `scrollOffset` to keep the cursor in view.
6. Render top border, each visible line (with cursor marker), bottom border.
7. If autocomplete is open, append the dropdown rows.

### 5.1 `layoutText(contentWidth)` and word-wrap

`layoutText(contentWidth)` (`editor.ts:580-668`) walks `state.lines`. Each line either fits (`visibleWidth <= contentWidth`) and becomes one `LayoutLine`, or is wrapped via `wordWrapLine(line, contentWidth, [...segment(line, "grapheme")])` (`editor.ts:120-219`) into multiple `LayoutLine`s. `wordWrapLine` is the core wrap algorithm:

- Iterates graphemes from the segmenter.
- Tracks `currentWidth` and the last "wrap opportunity" (whitespace followed by non-whitespace, or CJK↔CJK boundary).
- On overflow, backtracks to the wrap opportunity if doing so still fits the next grapheme; otherwise force-breaks at the current position.
- If a single segment is wider than `maxWidth` (e.g. a paste marker in a narrow terminal), it recursively wraps that segment, treating the split as visual only — the segment remains logically atomic for cursor movement / editing.

The `LayoutLine` returned for each chunk has `{ text, hasCursor, cursorPos? }`. For the cursor's logical line, `cursorPos` is computed relative to the chunk's `startIndex` (so a wrapped chunk can have the cursor at `length`, the "at end of segment" position).

### 5.2 Padding

`paddingX` (`editor.ts:269`, `setPaddingX` at `380-385`) is configurable 0..`floor((width-1)/2)`. When non-zero, `cursorInPadding` lets the cursor overflow one column into the right padding (`editor.ts:534-538`). This is how pi makes the editor visually "feel" padded on both sides without making the cursor vanish when the user types past the end.

### 5.3 Vertical scrolling

`scrollOffset` (`editor.ts:272`) is the index of the first visible `LayoutLine` in the rendered slice. `render()` adjusts it so the cursor is always in view:

```ts
if (cursorLineIndex < scrollOffset) scrollOffset = cursorLineIndex;
else if (cursorLineIndex >= scrollOffset + maxVisibleLines)
  scrollOffset = cursorLineIndex - maxVisibleLines + 1;
scrollOffset = clamp(scrollOffset, 0, max(0, layoutLines.length - maxVisibleLines));
```

(`editor.ts:496-510`.) When `scrollOffset > 0` the top border becomes `─── ↑ N more ───` (`editor.ts:514-519`); when content extends below the visible slice the bottom border becomes `─── ↓ N more ───` (`editor.ts:570-575`). The `N more` is the count of hidden lines, computed from the layout array.

### 5.4 Top and bottom borders

Both are `this.borderColor("─".repeat(width))` (`editor.ts:514, 574`). The `borderColor` is a field, not a method call on the theme, because it's reassigned at runtime: `interactive-mode.ts:3573-3576` swaps it to `bashMode` when the typed text starts with `!`, or to the appropriate `thinking{Off,Minimal,Low,Medium,High,Xhigh}` color when the text starts with the thinking trigger.

## 6. Cursor rendering: ANSI inverse, IME hook

For each `LayoutLine` with `hasCursor` (`editor.ts:521-553`):

```ts
const before = displayText.slice(0, layoutLine.cursorPos);
const after  = displayText.slice(layoutLine.cursorPos);
const marker = emitCursorMarker ? CURSOR_MARKER : "";   // when focused
if (after.length > 0) {
  // Cursor is on a character (grapheme). Replace the first grapheme
  // with the highlighted version. Inverse the grapheme, not a single
  // code unit, so emoji / CJK / ZWJ sequences render as one block.
  const afterGraphemes = [...this.segment(after, "grapheme")];
  const firstGrapheme = afterGraphemes[0]?.segment || "";
  const restAfter = after.slice(firstGrapheme.length);
  const cursor = `\x1b[7m${firstGrapheme}\x1b[0m`;
  displayText = before + marker + cursor + restAfter;
} else {
  // Cursor is at end of line: render an inverted space. If this
  // overflows contentWidth into padding, drop one padding char so
  // the cursor stays flush against the right padding edge.
  const cursor = "\x1b[7m \x1b[0m";
  displayText = before + marker + cursor;
  lineVisibleWidth += 1;
  if (lineVisibleWidth > contentWidth && paddingX > 0) cursorInPadding = true;
}
```

Three details matter:

- **Grapheme-aware cursor.** The first grapheme of `after` is inverted as a unit. A `👨‍👩‍👧‍👦` cluster (11 UTF-16 units) inverts as one block; a CJK character inverts as one block. This is what gives the cursor its solid, single-cell appearance even on multi-codepoint input.
- **Zero-width marker before the cursor.** When `focused === true`, `CURSOR_MARKER` (`"\x1b_pi:c\x07"`) is emitted just before the fake cursor. The TUI scanner finds this marker in the rendered output, computes the row from its position in the array, and writes a `CSI row;col H` to place the hardware cursor there. This is the IME hook (§1.1).
- **Padding overflow.** When the cursor goes into the right padding region, `cursorInPadding` shortens the right padding by one column so the cursor stays flush against the visual right border instead of disappearing off-screen.

**End-of-line cursor (inverted space):** the editor reserves a column for the cursor when `paddingX === 0` (`layoutWidth = contentWidth - 1` at `editor.ts:459`). When `paddingX > 0`, the cursor may overflow into the padding (see `cursorInPadding` handling).

## 7. Insertion: characters, paste, multi-line

### 7.1 `insertCharacter(char)`

`insertCharacter(char, skipUndoCoalescing?)` (`editor.ts:1088-1144`) is the per-keystroke path:

1. `exitHistoryBrowsing()` — any in-progress history walk is cancelled (the draft is lost on edit).
2. **Undo coalescing** (unless `skipUndoCoalescing`): if the new char is whitespace or the previous `lastAction !== "type-word"`, push an undo snapshot; then set `lastAction = "type-word"`. The pattern is the fish-shell "space captures state before itself, word runs coalesce" model — see §11.
3. Splice `before + char + after` into `state.lines[cursorLine]`; advance `cursorCol` by `char.length`.
4. Fire `onChange(getText())`.
5. Trigger or update autocomplete (§15).

The `skipUndoCoalescing` flag is set by `handlePaste()` so a pasted run is one undo unit, not N.

### 7.2 `handlePaste(pastedText)`

`handlePaste` (`editor.ts:1146-1228`) is reached via the bracketed-paste path (§7.4) or via direct programmatic insertion (`insertTextAtCursor`, `editor.ts:1020`). Steps:

1. Decode CSI-u Ctrl+<letter> re-encoding that tmux etc. apply inside bracketed paste (`editor.ts:1156-1165`) — important so newlines survive.
2. `normalizeText` — line-ending and tab normalization.
3. Filter non-printable chars except newline.
4. **File-path heuristic** (`editor.ts:1184-1194`): if the paste starts with `/`, `~`, or `.` AND the char before the cursor is a word char, prepend a space. This makes "paste a path after a word" produce `foo /path/to/bar` instead of `foo/path/to/bar`.
5. **Large-paste detection** (`editor.ts:1201-1217`): if the paste is >10 lines OR >1000 chars, store it in `this.pastes` with an incrementing id and insert a paste marker (`[paste #N +123 lines]` or `[paste #N 1234 chars]`) into the buffer. The marker is atomic for cursor / deletion / wrap. `getExpandedText()` substitutes the original content back.
6. **Small paste**: call `insertTextAtCursorInternal(text)` which handles single- and multi-line insertion uniformly (`editor.ts:1037-1078`).

### 7.3 Multi-line insertion

`insertTextAtCursorInternal(text)` (`editor.ts:1037-1078`) splits on `\n` and rebuilds `state.lines`:

- Single line: splice into the current line.
- Multi-line: the first inserted line merges with the text before the cursor; the middle lines become new entries; the last inserted line merges with the text after the cursor. Cursor lands at the end of the last inserted line.

### 7.4 Bracketed paste

`handleInput(data)` recognizes `\x1b[200~` as the bracketed-paste start (`editor.ts:610-617`) and buffers all subsequent input until `\x1b[201~`, at which point the accumulated content is passed to `handlePaste`. Anything past the end-marker (e.g. a stray keypress that arrived in the same chunk) is re-fed into `handleInput` recursively (`editor.ts:621-629`).

### 7.5 Submit, newline, and the backslash-Enter workaround

`handleInput` distinguishes three new-line / submit paths (`editor.ts:777-810`):

- `tui.input.newLine` → `addNewLine()` (split current line at cursor)
- `tui.input.submit` → `submitValue()` (trim, clear state, fire `onSubmit`)
- backslash + Enter → `shouldSubmitOnBackslashEnter` deletes the trailing `\`, then submits

`shouldSubmitOnBackslashEnter` (`editor.ts:1269-1278`) checks `kb.getKeys("tui.input.submit").includes("shift+enter") || kb.getKeys("tui.input.submit").includes("shift+return")`. If the terminal doesn't distinguish Shift+Enter from Enter, the editor lets users type `\` then Enter to mean "insert a newline, not submit". This is the de-facto convention everywhere backslash-Enter is needed.

`submitValue()` (`editor.ts:1280-1295`):

1. Cancel any pending autocomplete.
2. Expand paste markers → `expandPasteMarkers(lines.join("\n")).trim()`.
3. Reset `state` to `{ lines: [""], cursorLine: 0, cursorCol: 0 }`.
4. Clear `pastes`, `pasteCounter`, `scrollOffset`, `undoStack`, `lastAction`, `historyIndex`, `historyDraft`.
5. Fire `onChange("")` and `onSubmit(result)`.

## 8. Deletion: grapheme-aware, kill-ring

The four deletion actions all funnel through a small set of primitives. Each mutator: pushes an undo snapshot *before* mutating, updates `state`, fires `onChange`, and (for backspace / forward-delete) re-evaluates autocomplete.

### 8.1 `handleBackspace` (Ctrl+H, Backspace)

`handleBackspace` (`editor.ts:1297-1372`):

- If `cursorCol > 0`: segment `slice(0, cursorCol)` for graphemes, take the last segment, splice it out. If that last grapheme is a paste marker, also delete the corresponding entry from `this.pastes` and **renumber** every later paste marker so ids stay contiguous (`editor.ts:1316-1335`).
- Else if `cursorLine > 0`: merge `lines[cursorLine]` onto `lines[cursorLine - 1]`; cursor moves to the seam.
- At `cursorCol = 0, cursorLine = 0`: no-op.

### 8.2 `handleForwardDelete` (Delete, Ctrl+D)

`handleForwardDelete` (`editor.ts:1664-1713`): symmetric to backspace, deleting the first grapheme of `slice(cursorCol)`. At end-of-line, merges with the next line.

### 8.3 `deleteWordBackwards` (Ctrl+W, Alt+Backspace) and `deleteWordForward` (Alt+D, Alt+Delete)

Both delete a word via `findWordBackward` / `findWordForward` (`packages/tui/src/word-navigation.ts:22-127`). Pure functions; they only compute the target column. The mutators:

- `deleteWordBackwards` (`editor.ts:1614-1662`): at column 0, merge with the previous line. Otherwise, find the previous word boundary and slice the range `[deleteFrom, cursorCol)` out of `state.lines[cursorLine]`.
- `deleteWordForward` (`editor.ts:1581-1612`): at end-of-line, merge with next line. Otherwise, find the next boundary and slice `[cursorCol, deleteTo)` out.

Both push the deleted text into `this.killRing` (§12) and set `lastAction = "kill"` so consecutive kills accumulate.

### 8.4 `deleteToStartOfLine` (Ctrl+U) and `deleteToEndOfLine` (Ctrl+K)

- `deleteToStartOfLine` (`editor.ts:1500-1528`): if `cursorCol > 0`, push `slice(0, cursorCol)` to kill ring (prepend); at column 0, push `"\n"` and merge with previous line.
- `deleteToEndOfLine` (`editor.ts:1530-1556`): if `cursorCol < line.length`, push `slice(cursorCol)` to kill ring (append); at end-of-line, push `"\n"` and merge with next line.

Both use `killRing.push(..., { accumulate: lastAction === "kill" })` so consecutive line-end kills collapse into one entry.

## 9. Cursor movement: grapheme, word, jump

### 9.1 Grapheme movement

`moveCursor(deltaLine, deltaCol)` (`editor.ts:1729-1807`) is the core mutator. For horizontal moves:

- Right: take the first grapheme of `slice(cursorCol)` and advance by its `length`. At end-of-line, descend to `cursorLine + 1, cursorCol = 0`. At end of last line: store `preferredVisualCol` so a subsequent vertical move can place the cursor at the original column even if the next line is shorter (§10).
- Left: take the last grapheme of `slice(0, cursorCol)` and retreat by its `length`. At column 0, ascend to `cursorLine - 1, cursorCol = line.length`. At start of first line: no-op.

Both use `setCursorCol` which clears `preferredVisualCol` and `snappedFromCursorCol` so horizontal movement resets the sticky column.

### 9.2 Line ends

- `moveToLineStart` (`editor.ts:1437-1440`): `cursorCol = 0`.
- `moveToLineEnd` (`editor.ts:1442-1447`): `cursorCol = line.length`.

### 9.3 Word movement

`moveWordBackwards` / `moveWordForwards` (`editor.ts:1844-1857`, `2060-2073`) delegate to `findWordBackward` / `findWordForward`. The segmenter is the *word* granularity `Intl.Segmenter`, with `isAtomicSegment: isPasteMarker` so paste markers are treated as one word for jump purposes.

Word navigation rules (`word-navigation.ts:22-127`):

- Skip trailing whitespace backward / leading whitespace forward.
- On a word-like segment, jump to the next ASCII punctuation boundary *inside* the segment (so `fooBar` is treated as one word for forward, but `foo,bar` jumps from `foo` to `bar`).
- On a punctuation run, treat the whole run as a single non-word unit.
- On an atomic segment (paste marker), skip the whole segment.

### 9.4 Character jump (Ctrl+], Ctrl+Alt+])

`jumpMode: "forward" | "backward" | null` (`editor.ts:306`) is set by Ctrl+] (forward) or Ctrl+Alt+] (backward). The next printable keypress is consumed and triggers `jumpToChar(printable, direction)` (`editor.ts:2036-2062`):

- Walks lines in the chosen direction starting from `cursorLine`.
- On the cursor's current line, the search starts at `cursorCol + 1` (forward) or `cursorCol - 1` (backward) so the character under the cursor is skipped.
- Uses `String.indexOf(char, from)` (forward) or `String.lastIndexOf(char, from)` (backward) per line.
- Multi-line: continues into subsequent (forward) or prior (backward) lines if the current line has no match.
- If no match is found anywhere, the cursor is unchanged.

`handleInput` early-exits jump mode on a second Ctrl+] / Ctrl+Alt+] press (`editor.ts:590-594`) and on a control character; on a printable character it consumes the key and performs the jump, returning.

### 9.5 Page up / down

`pageScroll(direction)` (`editor.ts:1810-1820`): moves the cursor by `max(5, floor(terminalRows * 0.3))` visual lines in the given direction. Delegates to `moveToVisualLine` so the sticky-column logic applies.

## 10. Vertical cursor and the sticky-column decision table

Vertical cursor movement (Up, Down, PageUp, PageDown) is the trickiest part of the editor. The challenge: the user's mental model is "I want column N", but the visual line under the cursor may not have N columns. The editor must:

1. Determine which visual line the cursor is currently on.
2. Decide which column to land on in the target visual line.
3. Update `preferredVisualCol` so subsequent vertical moves can repeat the same column when the user keeps pressing Up/Down.

### 10.1 `buildVisualLineMap(width)`

`buildVisualLineMap` (`editor.ts:1716-1749`) returns an array of `{ logicalLine, startCol, length }` for each visual line, computed by running the same `wordWrapLine` that `render()` uses. So vertical moves always use the same wrap that the user sees.

### 10.2 `moveToVisualLine(visualLines, from, to)`

`moveToVisualLine` (`editor.ts:1414-1435` call site; algorithm at `editor.ts:1378-1455`) computes the target column with the following logic:

- Compute `currentVisualCol` — the cursor's column *relative to the visual line's startCol*.
- Compute `sourceMaxVisualCol` — the maximum valid visual column in the source VL. For non-last segments of a wrapped line this is `length - 1` (you can't stand "past" the segment); for the last segment it's `length` (you can stand at end).
- Compute `targetMaxVisualCol` similarly for the target VL.
- Call `computeVerticalMoveColumn(currentVisualCol, sourceMaxVisualCol, targetMaxVisualCol)` to get `moveToVisualCol`.
- Land the cursor at `targetVL.logicalLine, targetVL.startCol + moveToVisualCol`, clamped to the line's length.
- **Atomic-segment snap**: if the resulting column lands inside a multi-grapheme paste marker, snap to the marker's start. Save the pre-snap column in `snappedFromCursorCol` so the next vertical move can resolve to the original visual column.

### 10.3 The sticky-column decision table

`computeVerticalMoveColumn` (`editor.ts:1448-1499`) is documented with an explicit table. The four inputs:

- `P` — `preferredVisualCol !== null` (a sticky column has been set)
- `S` — cursor is in the middle of the source line (`currentVisualCol < sourceMaxVisualCol`)
- `T` — target line is shorter than the current visual column (`targetMaxVisualCol < currentVisualCol`)
- `U` — target line is shorter than the preferred visual column (`targetMaxVisualCol < preferredVisualCol`)

| P | S | T | U | Scenario | Set preferred | Move to |
|---|---|---|---| --- | --- | --- |
| 0 | * | 0 | - | Start nav, target fits | `null` | `currentVisualCol` |
| 0 | * | 1 | - | Start nav, target shorter | `currentVisualCol` | `targetMaxVisualCol` |
| 1 | 0 | 0 | 0 | Clamped, target fits preferred | `null` | `preferredVisualCol` |
| 1 | 0 | 0 | 1 | Clamped, target longer but still can't fit preferred | keep | `targetMaxVisualCol` |
| 1 | 0 | 1 | - | Clamped, target even shorter | keep | `targetMaxVisualCol` |
| 1 | 1 | 0 | - | Rewrapped, target fits current | `null` | `currentVisualCol` |
| 1 | 1 | 1 | - | Rewrapped, target shorter than current | `currentVisualCol` | `targetMaxVisualCol` |

The intuition:

- No preferred yet → adopt the current visual column as preferred if the target was clamped (row 2).
- Preferred set, cursor at end of source (S=0):
  - Target can fit preferred → use it, clear preferred (row 3).
  - Target can't fit preferred → land at end, keep preferred (rows 4, 5).
- Preferred set, cursor in middle of source (S=1): the user is in a "navigation" session, not a "destination" session. Don't update preferred unless the target was clamped. If clamped, adopt current visual column as the new preferred (rows 6, 7).

### 10.4 What clears the sticky column

`setCursorCol(col)` (`editor.ts:1374-1378`) clears `preferredVisualCol` and `snappedFromCursorCol`. Every non-vertical cursor move goes through `setCursorCol` — typing, backspace, mouse click, word jump, line-start, line-end. The sticky column lives only as long as the user is moving vertically; any horizontal action resets it.

The result is the canonical "vim-style" behavior: pressing Up then Up then Up through lines of different lengths lands the cursor at the same logical column when it fits, and at the end of the line when it doesn't, and repeats that pattern on the next session.

## 11. Undo: fish-style coalescing

`UndoStack<S>` (`packages/tui/src/undo-stack.ts:6-32`) is a generic clone-on-push stack: `push(state)` calls `structuredClone(state)`, `pop()` returns the most recent clone. There is no ring, no merge, no capacity limit beyond JS memory.

`Editor.pushUndoSnapshot()` (`editor.ts:2016-2018`) pushes `this.state` (the Editor's `EditorState`) before any mutation. Every mutator is responsible for calling it. `Editor.undo()` (`editor.ts:2020-2028`): `Object.assign(this.state, snapshot); this.lastAction = null; this.preferredVisualCol = null; fire onChange`.

### 11.1 The fish-style coalescing rule

The hard part is *when* to push. If we pushed before every keystroke, undo would remove one character at a time — annoying for typing. Pi uses the fish-shell convention (`editor.ts:1088-1104`):

```ts
if (isWhitespaceChar(char) || this.lastAction !== "type-word") {
  this.pushUndoSnapshot();
}
this.lastAction = "type-word";
```

Translation:

- The first word-character after a non-typing action pushes a snapshot, then sets `lastAction = "type-word"`.
- Consecutive word-characters with `lastAction === "type-word"` *don't* push. They coalesce.
- Any whitespace char pushes a snapshot. This means a space captures state *before itself*, so undoing after `hello ` undoes the space + the word, returning to `""` (well, to `hello` minus the word — see below).

Combined behavior:

| Input sequence | Snapshots pushed (before each char) | Undo removes |
| --- | --- | --- |
| `hello` | before `h` | "hello" (one undo) |
| `hello world` | before `h`, before ` ` | "hello", then "" (two undos) |
| `hello  ` | before `h`, before ` `, before ` ` | "hello", "hello ", "" |
| `hello\nworld` | before `h`, before `\n` | "hello", "hello\n", "" |
| `hello\b` (with backspace) | before `h`, before `\b` | "hell", "hello" |

The `lastAction` field is also `null`-ed by backspace, forward-delete, undo, history navigation, kill, yank, and any explicit "non-typing" action. So `aXb` (insert `a`, then `X` via shift, then `b`) is three undo units (assuming `X` is whitespace — it's not, so `a`, `X`, `b` coalesce as one; but `a b` is two).

`skipUndoCoalescing` is passed by `handlePaste()` and by `insertTextAtCursorInternal()` (when called as part of an autocomplete apply) so a paste is one undo unit.

## 12. Kill ring and yank-pop

`KillRing` (`packages/tui/src/kill-ring.ts:6-54`) is a stack of killed strings. `push(text, opts)`:

- If `opts.accumulate` is true and the ring is non-empty, pop the last entry and re-push with `text` prepended (if `opts.prepend`) or appended (if not). This is how consecutive kills merge.
- Otherwise push as a new entry.

`peek()` returns the top without popping; `rotate()` moves the top to the bottom (for yank-pop).

### 12.1 Which mutations populate the ring

| Mutator | Pushed text | Direction |
| --- | --- | --- |
| `deleteToStartOfLine` (Ctrl+U) | `slice(0, cursorCol)` (or `"\n"` at col 0) | prepend |
| `deleteToEndOfLine` (Ctrl+K) | `slice(cursorCol)` (or `"\n"` at end) | append |
| `deleteWordBackwards` (Ctrl+W, Alt+Backspace) | the deleted word | prepend |
| `deleteWordForward` (Alt+D, Alt+Delete) | the deleted word | append |

All set `lastAction = "kill"` so a second kill accumulates. A non-kill action (typing, cursor move, undo) sets `lastAction = null`, breaking the chain.

### 12.2 Yank

`yank()` (Ctrl+Y, `editor.ts:1860-1871`): peek the ring, call `insertYankedText(text)`, set `lastAction = "yank"`.

`insertYankedText` (`editor.ts:1880-1923`) inserts at cursor, handling multi-line text the same way as multi-line paste. `setCursorCol(...)` is called inside, which clears the sticky column.

### 12.3 Yank-pop

`yankPop()` (Alt+Y, `editor.ts:1873-1897`) only works immediately after a yank and only when the ring has >1 entry. It calls `deleteYankedText()` (remove the previously-inserted text from the buffer — symmetric to `insertYankedText`), `rotate()` the ring, then `insertYankedText(text)` again with the new top.

`lastAction = "yank"` is preserved across the yank-pop so a second Alt+Y continues cycling. Any non-yank action between yanks (typing, cursor move, etc.) breaks the chain — `yankPop` is a no-op when `lastAction !== "yank"`.

## 13. Prompt history and up/down navigation

`history: string[]` (`editor.ts:300`) stores recent prompts, newest at index 0. `historyIndex: number` (`editor.ts:301`) is the navigation position: `-1` means "not browsing, showing the live buffer" (the `historyDraft`); `0..history.length-1` is an index into `history`.

### 13.1 `addToHistory(text)`

`addToHistory(text)` (`editor.ts:392-402`):

1. `trim()` the input.
2. Empty → return.
3. If the new entry equals `history[0]` (the most recent), return. Consecutive duplicates are skipped.
4. `unshift` onto the front.
5. If `history.length > 100`, `pop()` the oldest.

This is called by the application (`interactive-mode.ts:2552` in `submitValue` flow) after a successful submit, not by the editor itself.

### 13.2 `navigateHistory(direction: 1 | -1)`

`navigateHistory` (`editor.ts:434-466`):

- `direction = -1` (Up): newIndex = historyIndex + 1.
- `direction = +1` (Down): newIndex = historyIndex - 1.

If `newIndex < -1` or `newIndex >= history.length`, return — bounds.

If transitioning from `historyIndex = -1` (live buffer) to `>= 0` (history):

- Push an undo snapshot (so the live buffer can be restored by undo).
- Save `historyDraft = structuredClone(state)` — the live buffer to restore on Down-past-bottom.

Set `historyIndex = newIndex`. If newIndex is -1, restore the draft; otherwise call `setTextInternal(history[newIndex], direction === -1 ? "start" : "end")` — Up positions cursor at the start of the recalled entry, Down positions it at the end. `setTextInternal` fires `onChange` so the application sees the buffer change.

### 13.3 Arrow-key handling

Up/Down arrows are dispatched from `handleInput` (`editor.ts:817-841`):

- Up:
  - If `isOnFirstVisualLine()` AND (`isEditorEmpty()` OR `historyIndex > -1` OR `cursorCol === 0`) → `navigateHistory(-1)` (history walk).
  - Else if `isOnFirstVisualLine()` → `moveToLineStart()` (jump to start of wrapped line).
  - Else → `moveCursor(-1, 0)` (vertical cursor move).
- Down: symmetric. If `historyIndex > -1` and on last visual line → `navigateHistory(+1)`. If on last visual line → `moveToLineEnd()`. Else → `moveCursor(+1, 0)`.

The conditions for history walk vs. vertical move are:

- Empty buffer: Up always recalls. Down past newest does nothing.
- Non-empty buffer at start of line: Up recalls. Down past newest restores the draft.
- Cursor in middle: Up moves vertically; you only enter history mode when you Up from `cursorCol === 0` or from an empty line.

This is a careful UX: you can edit in the middle of a line without accidentally recalling history, and history recall happens naturally when you press Up at the start of the line.

### 13.4 `setText` and `insertTextAtCursor` reset history

Both `setText(text)` (`editor.ts:1003-1015`) and `insertTextAtCursor(text)` (`editor.ts:1020-1025`) call `exitHistoryBrowsing()`, which clears `historyIndex` and `historyDraft`. So programmatic edits (e.g. an extension pre-filling the buffer) cancel any in-progress history walk.

## 14. Multi-line editing: line split, merge, IME submit

### 14.1 `addNewLine` (Shift+Enter, Ctrl+J)

`addNewLine` (`editor.ts:1237-1256`):

1. Cancel autocomplete, exit history browsing, clear `lastAction`.
2. Push undo snapshot.
3. Split `lines[cursorLine]` at `cursorCol`: `before = slice(0, col)`, `after = slice(col)`. Set `lines[cursorLine] = before` and `splice(cursorLine + 1, 0, after)`.
4. `cursorLine++; cursorCol = 0`.
5. Fire `onChange`.

### 14.2 Line merge on delete

Backspace at column 0 (`editor.ts:1340-1351`): `lines[cursorLine - 1] += lines[cursorLine]`; `splice(cursorLine, 1)`; `cursorLine--; cursorCol = previousLine.length`. The cursor lands at the seam, which is the join point.

Forward delete at end of line (`editor.ts:1700-1707`): `lines[cursorLine] += lines[cursorLine + 1]`; `splice(cursorLine + 1, 1)`. Cursor stays put.

`deleteToStartOfLine` at column 0 (`editor.ts:1516-1525`) and `deleteToEndOfLine` at end of line (`editor.ts:1544-1553`) do the same merge but with a `"\n"` pushed to the kill ring.

### 14.3 Submit and the backslash-Enter workaround

See §7.5. The editor preserves Shift+Enter as a newline even on terminals that don't distinguish it from Enter, via the `\`-then-Enter convention.

## 15. Autocomplete: provider, debounce, paste-marker awareness

`AutocompleteProvider` (`packages/tui/src/autocomplete.ts:687+`) is the interface an application implements to plug in completion suggestions:

```ts
interface AutocompleteProvider {
  triggerCharacters?: string[];
  shouldTriggerFileCompletion?(lines, line, col): boolean;
  getSuggestions(lines, line, col, { signal, force }): Promise<AutocompleteSuggestions | null>;
  applyCompletion(lines, line, col, item, prefix): { lines, cursorLine, cursorCol };
}
```

`AutocompleteSuggestions` is `{ items: Array<{ value, label, description? }>, prefix: string }`.

### 15.1 Trigger rules

The editor maintains three patterns built from `autocompleteTriggerCharacters` (`editor.ts:277-279`):

- `DEFAULT_AUTOCOMPLETE_TRIGGER_CHARACTERS = ["@", "#"]` (`editor.ts:237`).
- `autocompleteTriggerPattern` — `(?:^|[\s])[<chars>][^\s]*$` — matches a token that starts with a trigger char at the start of input or after whitespace.
- `autocompleteDebouncePattern` — the same but excluding `@`, since `@` autocomplete is more aggressive (file/attachment completion, debounced).

A provider can extend the trigger characters via `setAutocompleteProvider` (`editor.ts:372-375`) which calls `setAutocompleteTriggerCharacters`.

### 15.2 Auto-trigger on input

`insertCharacter` checks three cases (`editor.ts:1112-1141`):

1. `char === "/"` AND `isAtStartOfMessage()` (only on the first line, only when the cursor is in whitespace or at `/`) → trigger.
2. `char` is one of the trigger chars AND it's at the start of a token (preceded by whitespace or BOL) → trigger.
3. `char` is alphanumeric / `.` / `-` / `_` AND the text before the cursor matches `autocompleteTriggerPattern` or `isInSlashCommandContext` → trigger.

Backspace and forward-delete also re-evaluate: if `autocompleteState` is set, `updateAutocomplete()`; otherwise check the trigger patterns and `tryTriggerAutocomplete()` if they match.

### 15.3 `requestAutocomplete` flow

`requestAutocomplete({ force, explicitTab })` (`editor.ts:2169-2192`):

1. If `force` and the provider's `shouldTriggerFileCompletion` returns false, return.
2. `cancelAutocompleteRequest()`: bump `autocompleteStartToken`, clear any debounce timer, abort the in-flight `AbortController`.
3. Compute debounce: explicitTab or force → 0ms; matches `autocompleteDebouncePattern` → `ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS = 20ms`; else → 0ms. The 20ms debounce is for `@`-style attachment completion where rapid typing shouldn't fire a request per keystroke.
4. Either schedule the request via `setTimeout` or call `startAutocompleteRequest` directly.

`startAutocompleteRequest` (`editor.ts:2194-2220`) is the async pipeline:

- Chains onto `autocompleteRequestTask` so concurrent requests are serialized.
- Captures `startToken` (checked before each await) and a snapshot of `(text, cursorLine, cursorCol)`.
- Creates a new `AbortController` and stores it on `this.autocompleteAbort`.
- Calls `provider.getSuggestions(...)`.
- After the promise resolves, checks `isAutocompleteRequestCurrent(requestId, controller, snapshotText, snapshotLine, snapshotCol)` (`editor.ts:2251-2260`) — abort? requestId matches? text/line/col unchanged? If any check fails, drop the result.
- Empty results → `cancelAutocomplete()` and render.
- Otherwise apply the suggestions.

### 15.4 Force vs. regular mode

`autocompleteState: "regular" | "force" | null`:

- `regular` — auto-triggered by typing. Updates as the user types more.
- `force` — Tab-triggered (`tui.input.tab` in `handleInput`, `editor.ts:696-712`). Stays open as the user types (provider is re-queried with `force: true`). When Tab is pressed and only one suggestion exists, auto-apply without showing the menu (`editor.ts:2270-2287`).

The `force` mode is what enables "press Tab in the middle of `src/` and see the directory listing; press Tab again to navigate into the first entry" UX.

### 15.5 Selection during autocomplete

While `autocompleteState` is set, `handleInput` routes Up/Down/Tab/Esc/Enter to the autocomplete list (`editor.ts:648-704`):

- Up/Down → `autocompleteList.handleInput(data)` (arrow nav).
- Tab → apply selected.
- Enter → apply selected (slash commands) or just confirm-and-cancel (other triggers).
- Esc / Ctrl+C → `cancelAutocomplete()`.

Cursor movements while autocomplete is open also re-trigger via `updateAutocomplete()` so the picker stays in sync with the cursor position (`editor.ts:1790-1806`).

### 15.6 Selection-best-match on apply

When suggestions are applied, `getBestAutocompleteMatchIndex` (`editor.ts:2090-2111`) finds the index to highlight:

1. Exact match (prefix === item.value) always wins.
2. Otherwise first item whose value starts with the prefix.
3. Otherwise `-1` (keep default highlight).

This is what makes typing `/sett` highlight `/settings` automatically.

## 16. Large-paste markers as atomic segments

When a paste exceeds 1000 chars or 10 lines, `handlePaste` stores the original text in `this.pastes` (`Map<number, string>`) and inserts a marker like `[paste #N +123 lines]` or `[paste #N 1234 chars]` into the buffer (`editor.ts:1201-1217`).

### 16.1 Why markers

A 5000-line paste inserted literally would:

- Blow up `wordWrapLine` (each line is a separate visual line; 5000 lines * 30% of rows is way more than fits).
- Make cursor navigation weird (typing after a pasted block would put the cursor inside the paste).
- Make deletion a multi-thousand-grapheme operation.

Markers replace the visible buffer with a short, atomic token while keeping the original text accessible.

### 16.2 Marker atomicity

`PASTE_MARKER_REGEX = /\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]/g` (`editor.ts:14-16`). `isPasteMarker(segment)` (`editor.ts:18-21`) tests a single segment against `PASTE_MARKER_SINGLE`.

`segmentWithMarkers` (`editor.ts:23-72`) wraps `Intl.Segmenter` and *merges* the graphemes inside any marker whose id is in `this.validPasteIds()` into a single segment. So a marker behaves for cursor / deletion / word-jump / wrap as one grapheme cluster.

`validPasteIds()` (`editor.ts:367-369`) returns `new Set(this.pastes.keys())` — only currently-valid markers get merged. After `setText`, all markers are invalid (the map is cleared).

### 16.3 Cursor positioning and vertical snap

When vertical movement lands inside a marker, `moveToVisualLine` snaps the cursor to the marker's start and stores the pre-snap column in `snappedFromCursorCol` (`editor.ts:1394-1414`). The next vertical move uses `snappedFromCursorCol` to compute the correct visual column on whatever line the next move lands on.

### 16.4 Backspace on a marker

`handleBackspace` detects when the last grapheme is a paste marker (`editor.ts:1316-1335`), removes the corresponding entry from `this.pastes`, decrements `pasteCounter`, and **renumbers** every marker with a higher id (so the ids stay contiguous). Without the renumber, deleting `[paste #1]` would leave `[paste #2]` in place but `pastes[1]` missing — which would break `validPasteIds()`.

### 16.5 `getExpandedText()`

`getExpandedText()` (`editor.ts:963-970`) returns `expandPasteMarkers(lines.join("\n"))` — the marker-replaced text with all markers substituted back to their original content. Used by `submitValue()` to send the actual pasted content to the agent, and by extensions that need the full text.

## 17. Keybinding table

All keybindings are defined in `TUI_KEYBINDINGS` (`packages/tui/src/keybindings.ts:64`) and resolved at runtime via `KeybindingsManager.matches(data, id)` (`keybindings.ts:146-152`). Users may override individual bindings via `settings.json`; conflicts are surfaced by `getConflicts()`.

| Keybinding id | Default keys | Description |
| --- | --- | --- |
| `tui.editor.cursorUp` | `up` | Move cursor up (or recall history) |
| `tui.editor.cursorDown` | `down` | Move cursor down (or walk history forward) |
| `tui.editor.cursorLeft` | `left`, `ctrl+b` | Move cursor left by one grapheme |
| `tui.editor.cursorRight` | `right`, `ctrl+f` | Move cursor right by one grapheme |
| `tui.editor.cursorWordLeft` | `alt+left`, `ctrl+left`, `alt+b` | Move cursor one word left |
| `tui.editor.cursorWordRight` | `alt+right`, `ctrl+right`, `alt+f` | Move cursor one word right |
| `tui.editor.cursorLineStart` | `home`, `ctrl+a` | Move to start of current line |
| `tui.editor.cursorLineEnd` | `end`, `ctrl+e` | Move to end of current line |
| `tui.editor.jumpForward` | `ctrl+]` | Jump forward to character (next key) |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | Jump backward to character |
| `tui.editor.pageUp` | `pageUp` | Scroll up by page (with cursor) |
| `tui.editor.pageDown` | `pageDown` | Scroll down by page |
| `tui.editor.deleteCharBackward` | `backspace` | Delete one grapheme backward |
| `tui.editor.deleteCharForward` | `delete`, `ctrl+d` | Delete one grapheme forward |
| `tui.editor.deleteWordBackward` | `ctrl+w`, `alt+backspace` | Delete one word backward |
| `tui.editor.deleteWordForward` | `alt+d`, `alt+delete` | Delete one word forward |
| `tui.editor.deleteToLineStart` | `ctrl+u` | Delete to start of line (kill) |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | Delete to end of line (kill) |
| `tui.editor.yank` | `ctrl+y` | Yank most recent kill |
| `tui.editor.yankPop` | `alt+y` | Cycle through kill ring |
| `tui.editor.undo` | `ctrl+-` | Undo |
| `tui.input.newLine` | `shift+enter`, `ctrl+j` | Insert newline |
| `tui.input.submit` | `enter` | Submit |
| `tui.input.tab` | `tab` | Tab / autocomplete |
| `tui.input.copy` | `ctrl+c` | Copy selection |
| `tui.select.up` / `tui.select.down` | `up` / `down` | Move autocomplete selection |
| `tui.select.pageUp` / `tui.select.pageDown` | `pageUp` / `pageDown` | Page autocomplete |
| `tui.select.confirm` | `enter` | Confirm autocomplete selection |
| `tui.select.cancel` | `escape`, `ctrl+c` | Cancel autocomplete |

The keybinding IDs are exported via the `Keybindings` interface (`keybindings.ts:7-50`), allowing downstream packages to add their own via TypeScript declaration merging.

## 18. Customization surface: `EditorComponent`, `CustomEditor`, factories

### 18.1 `EditorComponent` — the public interface

`EditorComponent` (`packages/tui/src/editor-component.ts:11-65`) is the minimal contract an extension can implement to swap the editor (vim mode, modal editing, etc.):

```ts
interface EditorComponent extends Component {
  // Required
  getText(): string;
  setText(text: string): void;
  handleInput(data: string): void;
  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;

  // Optional
  addToHistory?(text: string): void;
  insertTextAtCursor?(text: string): void;
  getExpandedText?(): string;
  setAutocompleteProvider?(provider: AutocompleteProvider): void;
  borderColor?: (str: string) => string;
  setPaddingX?(padding: number): void;
  setAutocompleteMaxVisible?(maxVisible: number): void;
}
```

The base `Editor` class implements all of these. An extension can either subclass `Editor` (extending behavior) or implement `EditorComponent` from scratch (replacing it).

### 18.2 `CustomEditor` — the app-level subclass

`CustomEditor` (`packages/coding-agent/src/modes/interactive/components/custom-editor.ts:7-79`) adds:

- App-level keybindings (escape, ctrl+d, paste image, extension shortcuts).
- Dynamically replaceable handlers: `onEscape`, `onCtrlD`, `onPasteImage`, `onExtensionShortcut`.
- The `actionHandlers: Map<AppKeybinding, () => void>` for registering app actions.

`CustomEditor.handleInput(data)` checks extension shortcuts first, then app actions, then falls through to `super.handleInput(data)` for editor-level handling. The `isShowingAutocomplete()` guard ensures Escape during autocomplete cancels the autocomplete menu rather than triggering the app's interrupt action.

### 18.3 Factory pattern

Extensions can replace the editor at runtime via `ctx.ui.setEditorComponent((tui, theme, keybindings) => MyEditor)`. The factory receives `tui` (for `requestRender()`), `theme` (for `borderColor`, `selectList`), and `keybindings` (for app-level key matching). Passing `undefined` restores the default editor. See `tui.md:889-901` and `examples/extensions/modal-editor.ts`.

## 19. What jie-tui can and cannot take

### 19.1 Reuse wholesale

These are pure functions / data structures with no dependency on pi's TUI renderer; copy them verbatim into `packages/jie-tui/`:

- `findWordBackward` / `findWordForward` (`packages/tui/src/word-navigation.ts`). Used by Ctrl+W, Alt+Left, Alt+Right.
- `visibleWidth` (`packages/tui/src/utils.ts:216`). Used everywhere we need terminal column count.
- `graphemeSegmenter` / `wordSegmenter` (`packages/tui/src/utils.ts:10-23`). Used by every grapheme-aware operation.
- `cjkBreakRegex`, `PUNCTUATION_REGEX`, `isWhitespaceChar`, `isPunctuationChar` (`packages/tui/src/utils.ts:48, 800, 805, 812`).
- `KillRing` (`packages/tui/src/kill-ring.ts`). Pure data structure.
- `UndoStack<S>` (`packages/tui/src/undo-stack.ts`). Pure generic.

### 19.2 Reuse with Ink adaptation

These need small adaptations for Ink-based rendering:

- `wordWrapLine` (`packages/tui/src/components/editor.ts:120-219`). Pure function returning `TextChunk[]`; Ink-friendly. Already used by Markdown rendering.
- The sticky-column decision table (`computeVerticalMoveColumn`, `editor.ts:1448-1499`). Apply to `state.cursorLine`/`state.cursorCol` directly.

### 19.3 Reimplement for Ink

These depend on pi's imperative `render(width)` API and need to be reimplemented against React/Ink:

- The cursor render itself. Ink renders via React; we emit the inverse-space block via Text styling. The hardware-cursor IME hook is harder: jie-tui must either position the OS cursor via the `useCursor` API (Ink's existing escape hatch) or punt on IME candidate placement.
- The autocomplete dropdown. Ink can render it as a separate `<Box>` below the input; pi uses a single `render(width)` array. Behaviour-wise identical.
- The paste-marker atomic-segment machinery. With Ink + `<TextInput>`, multi-codepoint atomicity comes for free because `<TextInput>` treats the input string atomically. Marker renumbering on delete is unnecessary if we adopt a real paste-marker data structure (paste id stored separately from the text).

### 19.4 Architectural decision: imperative vs. React

Pi's Editor is ~2300 lines of imperative code. A full React port preserving all features (grapheme cursor, sticky column, kill ring, undo coalescing, history walk, autocomplete async-cancellation, paste markers, IME hook) would be 800-1500 lines of stateful component logic, with the same complexity but spread across hooks. jie-tui instead implements a native Ink editor with a deliberately reduced feature set: a `useEditorState` hook backed by a `useReducer` over `EditorBuffer` (`{ lines, cursorLine, cursorCol }`, `editor-state.ts`), grapheme-aware multi-line cursor movement, and an ANSI inverse-block cursor rendered inline (`editor-view.ts`). Closing the remaining gaps is a separate scope; see 19.5.

### 19.5 Delivery status

Delivered (in `packages/jie-tui/components/editor/`):

- **Multi-line cursor positioning** per pi §3, §9 — `cursorLine`, `cursorCol`, vertical/horizontal movement with `cursorCol` clamping when the target line is shorter. (`useEditorState.moveCursorUp`/`moveCursorDown`.)
- **Grapheme-aware insertion / deletion** per pi §7, §8 — `Intl.Segmenter({ granularity: "grapheme" })` walks `delete`-at-cursor and `backspace`-before-cursor by cluster unit, not by UTF-16 code unit. (`useEditorState.insert` / `backspace` / `forwardDelete`.)
- **Line-merge on boundary deletion** per pi §8 — backspace at `(line>0, col=0)` joins with the previous line; forward delete at end-of-non-last-line joins with the next line; backspace at `(0, 0)` and forward delete at end-of-last-line are no-ops.
- **Native cursor render** — ANSI inverse-video block rendered inline by `editor-view.ts` on the cursor line: an inverse space in front of the next grapheme, or a trailing inverse space at end-of-line. No hardware cursor placement at all.
- **History walk with draft capture/restore** — pi §13 semantics adapted to React state: `Up` at the top of the buffer with non-empty history enters walk mode (capturing the live buffer into `draft`); `Down` walks forward; `Down`-past-newest restores `draft` (`editor.tsx` `history`/`historyIndex`/`draft`).

Deferred:

1. **Word navigation** (`Alt+Left`, `Alt+Right`, `Ctrl+Left`, `Ctrl+Right`) — biggest UX win.
2. **Kill ring + yank** (`Ctrl+W`, `Ctrl+U`, `Ctrl+K`, `Ctrl+Y`).
3. **Undo**.
4. **Sticky column** — only matters when word-wrap is in play; we don't wrap yet.
5. **Autocomplete provider** (provider interface, async cancellation, paste-marker awareness) — pi §15. (jie-tui's slash-command and file-mention panels live outside the editor.)
6. **Paste markers** (atomic-segment insertion of large pastes) — pi §16.
7. **IME hook** via hardware cursor placement — pi §1.1.

## Where to look in pi

- Editor class (the whole thing): `~/workspace/pi/pi/packages/tui/src/components/editor.ts` (1-2333). Theme interface at 221-235; constructor at 268-279; state shape at 202-206.
- App-level subclass with dynamically-replaceable handlers: `~/workspace/pi/pi/packages/coding-agent/src/modes/interactive/components/custom-editor.ts` (1-79).
- Public extension interface: `~/workspace/pi/pi/packages/tui/src/editor-component.ts` (1-65).
- Keybinding registry and manager: `~/workspace/pi/pi/packages/tui/src/keybindings.ts` (1-244).
- Word navigation (pure functions): `~/workspace/pi/pi/packages/tui/src/word-navigation.ts` (1-117).
- Visible width, segmentation, CJK / emoji width assignment, ANSI stripping: `~/workspace/pi/pi/packages/tui/src/utils.ts` (1-1188; key functions at 10-23, 32-43, 48, 78-86, 216-273, 800-813).
- Kill ring: `~/workspace/pi/pi/packages/tui/src/kill-ring.ts` (1-54).
- Undo stack: `~/workspace/pi/pi/packages/tui/src/undo-stack.ts` (1-32).
- TUI renderer with `Focusable`, `CURSOR_MARKER`, IME hook: `~/workspace/pi/pi/packages/tui/src/tui.ts` (104-110, 120, 295+).
- Autocomplete provider interface and a default file-path implementation: `~/workspace/pi/pi/packages/tui/src/autocomplete.ts` (1-786).
- Integration: `interactive-mode.ts:491-495` instantiates the editor; `2595-2695` wires `onChange` / `onSubmit` to the slash-command and bash-mode flows; `2154-2155` exposes paste/setText to extensions; `3573-3576` swaps `borderColor` for bash / thinking-mode.
- Comprehensive test suite (4051 LOC): `~/workspace/pi/pi/packages/tui/test/editor.test.ts` — sections for history, kill ring, undo, autocomplete, character jump, sticky column, paste markers, multi-line, grapheme wrapping, Kitty CSI-u, backslash-Enter workaround.
