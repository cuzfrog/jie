# TUI Claude Code Reference

A self-contained reference on how Claude Code builds its terminal UI, organized by the aspects jie-tui needs. Each section explains the *mechanism* (data structures, algorithms, formulas, and a sketch of the implementation) well enough that an agent can re-implement equivalent logic without opening the claude-code source. File paths into `src/` are given as provenance, not as a substitute for the explanation.

Claude Code's TUI is a **forked Ink** (`src/ink/`) plus a large React component tree (`src/components/`). The fork is the load-bearing part: nearly every quality feature below depends on renderer-level hooks that stock Ink does not expose. The pragmatic lessons for jie-tui are noted per section, and consolidated in [§8](#8-what-jie-tui-can-and-cannot-take).

## Menu

1. [Architecture: the forked Ink](#1-architecture-the-forked-ink)
2. [Screen scroll](#2-screen-scroll)
3. [Message showing](#3-message-showing)
4. [Markdown rendering](#4-markdown-rendering)
5. [Code diff rendering](#5-code-diff-rendering)
6. [TUI decorations](#6-tui-decorations)
7. [UI / quality enhancements](#7-ui--quality-enhancements)
8. [What jie-tui can and cannot take](#8-what-jie-tui-can-and-cannot-take)

---

## 1. Architecture: the forked Ink

Claude Code does not run stock Ink. It maintains a fork at `src/ink/` with renderer-level additions. The additions matter because they are the foundation for every feature below.

### 1.1 What stock Ink gives you
A React reconciler that lays out a tree of `<Box>`/`<Text>` with Yoga, diffs against the previous frame, and writes ANSI to stdout. It exposes `useCursor()` (set an *absolute* screen `(x,y)`), `useWindowSize().rows` (terminal height), and `<Box overflow="scroll">` that clips but still mounts every child fiber.

### 1.2 What the fork adds
- **`CursorDeclarationContext`** (`src/ink/components/CursorDeclarationContext.ts`) + **`useDeclaredCursor`** (`src/ink/hooks/use-declared-cursor.ts`): a component declares where the caret is *relative to itself* (e.g. `{relativeX: 2, relativeY: 1, node}`) via context; the renderer resolves it to an *absolute* `(x,y)` using the component's Yoga-computed rect.
- **`nodeCache`** (`src/ink/node-cache.ts`): after Yoga layout, the renderer writes the absolute rect of every node into this cache each frame.
- **`ScrollBox`** (`src/ink/components/ScrollBox.tsx`): a `<Box overflow="scroll">` with an imperative scroll API. Scroll state lives on the DOM node, not React state.
- **`render-node-to-output.ts`**: viewport culling + smooth scroll-delta draining + cursor-rect resolution.
- **`log-update.ts` / alternate-screen preamble**: alt-screen frames reset to `(0,0)`; non-alt-screen frames return the physical cursor to the previous frame's position before applying a diff.

### 1.3 Mechanism: how the cursor rect is resolved
The renderer keeps a `cursorDeclaration` (the latest `{node, relativeX, relativeY}`) set during React's commit via the context hook. After Yoga layout, in `onRender`:

```ts
const decl = this.cursorDeclaration
const rect = decl !== null ? nodeCache.get(decl.node) : undefined
const target = decl !== null && rect !== undefined
  ? { x: rect.x + decl.relativeX, y: rect.y + decl.relativeY }
  : null
```

If the declared node is not in the cache (unmounted, scrolled away, stale), no move is emitted. The architectural pattern: **the edge layer (renderer) owns position; React components only declare intent.** No `useWindowSize().rows` arithmetic, immune to resize/scroll.

### 1.4 Mechanism: how scroll culling works at render time
`render-node-to-output` visits `ScrollBox`'s content children in order. For each child it asks: is the child's `[computedTop - scrollTop, computedTop - scrollTop + childHeight]` intersecting `[0, viewportHeight]`? If not, it skips writing the child entirely (cheap) but still must reserve the committed height so the box's total size is correct. This is *output* culling — the fiber and Yoga node still exist; only the write is skipped. To avoid allocating the fibers at all, a second React-level layer (§2) is needed.

---

## 2. Screen scroll

Files: `src/ink/components/ScrollBox.tsx`, `src/hooks/useVirtualScroll.ts`, `src/components/ScrollKeybindingHandler.tsx`, `src/components/VirtualMessageList.tsx`, `src/components/FullscreenLayout.tsx`.

### 2.1 Two-layer virtualization
Two independent layers, both required:
1. **React-level** (`useVirtualScroll`): mount only items in `viewport ± OVERSCAN_ROWS`. Spacer boxes hold the total scroll height at O(1) fiber cost for everything else.
2. **Ink-output-level** (renderer): even mounted items are clipped to the visible window at write time (§1.4).

Why both: the Ink layer alone still allocates all fibers. At ~250 KB RSS per `MessageRow`, a 1000-message session costs ~250 MB of grow-only memory (Ink buffer + WASM + JSC page retention). The React layer is what bounds that.

### 2.2 Mechanism: ScrollBox scroll state on the DOM node
`ScrollBox` is a `<Box overflow="scroll">`. Its scroll position is stored as fields on the underlying Ink DOM node (`scrollTop`, `pendingScrollDelta`, `stickyScroll`, `scrollAnchor`, clamp bounds). React state is *not* used for the per-event position, because setting state on every wheel tick would trigger a full reconciler pass per event.

`scrollBy(dy)` (the hot path):
```ts
el.stickyScroll = false          // user override cancels follow-tail
el.scrollAnchor = undefined      // wheel cancels any in-flight anchor seek
el.pendingScrollDelta = (el.pendingScrollDelta ?? 0) + Math.floor(dy)
scrollMutated(el)
```
`scrollMutated` does three things: (a) `markScrollActivity()` so background intervals skip their next tick, (b) `markDirty(el)` + `scheduleRenderFrom(el)`, (c) notify imperative subscribers. The actual render is **coalesced in a microtask**:
```ts
if (renderQueuedRef.current) return
renderQueuedRef.current = true
queueMicrotask(() => {
  renderQueuedRef.current = false
  scheduleRenderFrom(el)
})
```
A batch of wheel events in one input batch all mutate `pendingScrollDelta` before the microtask fires once — so one render drains the accumulated delta. `scrollToBottom()` is the one path that forces a React render (`forceRender`) because `stickyScroll` is an attribute the renderer observes; there is no DOM-only path for "follow tail".

`scrollToElement(el, offset)` *defers* the position read to render time: instead of computing a number now (which is stale by the time the throttled render fires), it stores `{el, offset}` as `scrollAnchor`. The renderer reads `el.yogaNode.getComputedTop()` in the same Yoga pass that computes `scrollHeight` → deterministic, no race.

### 2.3 Mechanism: React-level range computation (`useVirtualScroll`)
The hook keeps a `heightCache: Map<itemKey, rows>` filled by `measureRef(key)` callbacks attached to each mounted item's root `<Box>`. After Yoga layout, each item's computed height is written into the cache. From the cache it builds a prefix-sum `offsets[]` where `offsets[i]` = rows above item `i`, and `offsets[n]` = total height.

The visible range is found by binary search over `offsets`:
```
start = largest i with offsets[i] <= scrollTop
end   = smallest i with offsets[i]  >= scrollTop + viewportHeight
// then expand by overscan and clamp
start = max(0, start - OVERSCAN)
end   = min(n, end + OVERSCAN)
```
The two spacer boxes carry the rest of the height at O(1) cost:
```
topSpacer    = offsets[start]
bottomSpacer = offsets[n] - offsets[end]
```
So the tree always has exactly `end - start` real message rows plus two spacers, regardless of list length. `spacerRef` (attached to the top spacer) gives `listOrigin` = its Yoga `computedTop`, used to convert between list coordinates and absolute screen coordinates without fragile subtraction.

### 2.4 Mechanism: scroll quantization to avoid React commit storms
`scrollTop` is quantized into bins of `SCROLL_QUANTUM = OVERSCAN_ROWS >> 1 = 40` rows before deciding whether React must re-render. The hook subscribes to `ScrollBox` via `useSyncExternalStore` and returns a snapshot scrolled to the nearest bin. Every wheel tick therefore does **not** trigger a React commit + Yoga `calculateLayout` + Ink diff; React only re-renders when the mounted range must actually shift (≥40 rows of overscan remain before the next bin is needed). Visual scroll stays smooth because `ScrollBox.forceRender` fires on *every* `scrollBy`, and Ink reads the **real** `scrollTop` from the DOM node — independent of the quantized value React holds.

### 2.5 Mechanism: sticky-bottom ("follow tail")
- `stickyScroll` is set as a DOM attribute (not a ref) so it is available on the *first* render; ref callbacks fire too late.
- During its render phase, the renderer re-pins `scrollTop = maxScroll` when content grew and the prior `scrollTop` was at `prevMax`. This re-pin does **not** fire `ScrollBox.subscribe`.
- `isSticky()` therefore reads the stable `stickyScroll` flag rather than computing `scrollTop + viewportH >= scrollHeight` (which depends on transient layout values). Callers that care about the sticky case must treat "at bottom" as a fallback because the subscribe channel won't tell them.

### 2.6 Mechanism: smooth wheel acceleration
`ScrollKeybindingHandler.tsx` implements a wheel-acceleration state machine. Terminals send one SGR mouse event per intended row, but the *rate* varies by emulator, so a multiplier `mult` is applied and drained smoothly by the renderer's capped delta drain (§1.4). State:
```ts
type WheelAccelState = {
  time: number; mult: number; dir: 0 | 1 | -1;
  xtermJs: boolean; frac: number; base: number;
  pendingFlip: boolean; wheelMode: boolean; burstCount: number;
}
```
Three profiles:
- **Native terminals** (Ghostty/iTerm2): a *hard-window linear ramp*. Within `WHEEL_ACCEL_WINDOW_MS = 40ms` of the last event, `mult` ramps by `WHEEL_ACCEL_STEP = 0.3` up to `WHEEL_ACCEL_MAX = 6`; an idle gap resets `mult` to `base` (default 1). `CLAUDE_CODE_SCROLL_SPEED` (clamp (0,20]) overrides `base`.
- **xterm.js / VS Code**: an *exponential decay* curve. Given the gap `g` since the last event and half-life `h = 150ms`, momentum `m = 0.5^(g/h)`. Then `mult = min(cap, 1 + (mult-1)*m + step*m)` with `step = 5`, and cap `3` (slow, gap≥80ms) vs `6` (fast). A **carried fractional row** makes fractional multipliers exact over time:
  ```ts
  const total = state.mult + state.frac
  const rows = Math.floor(total)
  state.frac = total - rows      // carry remainder to next event
  ```
  Without `frac`, a steady `mult = 1.5` would always floor to `1` and lose half the rows.
- **Mouse wheel mode** (sticky): engaged when *encoder bounce* is detected — a physical wheel emits a spurious reverse tick that flip-flips back within `WHEEL_BOUNCE_GAP_MAX_MS = 200ms`. The detector defers a direction flip by one event; if the next event flips back, it's a bounce → `wheelMode = true`. The decay curve (same shape as the xterm.js path) then applies with `step = 15`, `cap = 15`, and a per-event ramp cap `WHEEL_MODE_RAMP = 3` so the multiplier ramps 1→4→7→…→15 over ~0.5s instead of jumping. It disengages on a long idle gap (`>1500ms`) or a *trackpad-signature burst* (`burstCount >= 5` of <5ms events — a real mouse produces ≤3 such events).

### 2.7 Mechanism: drag-to-scroll & clamp bounds
- While dragging the mouse past the viewport edge, a timer scrolls `AUTOSCROLL_LINES = 2` rows every `AUTOSCROLL_INTERVAL_MS = 50` (cell-change-only mouse tracking won't keep firing while stationary). Hard cap `AUTOSCROLL_MAX_TICKS = 200` (10s) in case the release event is lost.
- `setClampBounds(min, max)`: during burst scroll, the renderer clamps `scrollTop` to the mounted content's coverage span, so the viewport shows the edge of real content instead of a blank spacer while React catches up. `SLIDE_STEP = 25` bounds how many *new* items mount per commit (mounting ~190 cold items at once ≈ 290ms sync block), sliding the range toward the target over several commits with the clamp holding the viewport at the edge.

### 2.8 Mechanism: resize handling
On a column change, `useVirtualScroll` **scales cached heights by `oldCols/newCols`** instead of clearing them:
```ts
const ratio = prevColumns.current / columns
for (const [k, h] of heightCache) heightCache.set(k, Math.max(1, Math.round(h * ratio)))
```
Clearing forced ~190 extra mounts on first resize (each a fresh `marked.lexer` + highlight ≈ 3ms ≈ 600ms reconcile). Scaling keeps the mount range tight; real Yoga heights overwrite the estimates on the next layout. It also freezes the mount range for 2 renders during resize settling (skip the pre-resize Yoga measurement, then read post-resize Yoga into the cache) to avoid a second flash of mount/unmount churn.

---

## 3. Message showing

Files: `src/components/Messages.tsx`, `src/components/MessageRow.tsx`, `src/components/Message.tsx`, `src/components/messages/*`, `src/components/VirtualMessageList.tsx`.

### 3.1 Mechanism: type-driven dispatch
A single `Message` component switches on `message.type` and renders the matching leaf component (`AssistantTextMessage`, `UserTextMessage`, `SystemTextMessage`, `AssistantToolUseMessage`, `UserToolResultMessage`, … under `components/messages/`). No monolithic renderer; each message kind is its own file. `MessageRow` wraps a message to add continuation/spinner/animation logic and passes a frozen `lookups` object (`buildMessageLookups`) so each row doesn't recompute sibling relationships.

### 3.2 Mechanism: collapsing & grouping
Raw history is dense (many read/search tool results, hook summaries). A `collapsed` array is produced by:
- `collapseReadSearch` → one `collapsed_read_search` message with a live spinner while loading,
- `collapseHookSummaries`, `collapseTeammateShutdowns`, `groupToolUses` → fewer, fatter rows.

Virtualization (§2.3) then operates on `collapsed`, so grouping both improves signal-to-noise *and* reduces mounted fibers.

### 3.3 Mechanism: UUID-anchored render caps
The non-virtualized path (fullscreen off) must not mount unbounded history. Define `MAX = 200`, `STEP = 50`. A `SliceAnchor = { uuid, idx } | null` tracks where the slice begins:
```ts
function computeSliceStart(collapsed, anchorRef, cap = 200, step = 50): number {
  const anchor = anchorRef.current
  const anchorIdx = anchor ? collapsed.findIndex(m => m.uuid === anchor.uuid) : -1
  // anchor found → use it; else fall back to stored idx (clamped) so
  // collapse-regrouping uuid churn doesn't reset the view to 0
  let start = anchorIdx >= 0 ? anchorIdx
            : anchor ? Math.min(anchor.idx, Math.max(0, collapsed.length - cap)) : 0
  if (collapsed.length - start > cap + step) start = collapsed.length - cap
  // refresh anchor from whatever is at start (heals stale uuid after fallback)
  const msg = collapsed[start]
  anchorRef.current = msg ? { uuid: msg.uuid, idx: start } : null
  return start
}
```
Why a UUID anchor instead of `slice(-200)`: count-based slicing drops one message from the front on every append (CC-941) and shifts on compaction/regrouping that changes `collapsed.length` without adding messages (CC-1174). The anchor only advances when the rendered count genuinely exceeds `cap + step`. Content dropped from the live tree has already been printed to terminal scrollback, so the user can still scroll up natively. Headless one-shot renders (`/export`) pass `disableRenderCap` — no scrollback exists there.

### 3.4 Mechanism: streaming text placement
`streamingText` is rendered as the **last** item in the list. Because the final committed assistant message renders in the same slot, the transition from streamed preview to final message is positionally seamless (no upward jump of everything below). `streamingThinking` is shown during streaming or within a 30s timeout (so a briefly-stalled thought doesn't flicker out).

### 3.5 Mechanism: transcript vs prompt mode
`screen === "transcript"` (ctrl+o) toggles between two disjoint tree positions, which unmounts/remounts `<Messages>`, losing React's memo cache. The code therefore caches expensive work at module level (§7.3) so remount cost is a WeakMap lookup, not a re-highlight. `MAX_MESSAGES_TO_SHOW_IN_TRANSCRIPT_MODE = 30`.

### 3.6 Mechanism: per-message hover / click / verbosity
`VirtualMessageList` takes `onItemClick`, `isItemClickable(msg)`, `isItemExpanded(msg)`. Expanded items get a persistent grey background (`userMessageBackgroundHover`); hovered-but-not-expanded items get a hover text color via `TextHoverColorContext`. A keyboard cursor (`shift+↑/↓`) selects a message; `selectedIndex` drives the highlight and `MessageActionsNav` navigates prev/next user message by scanning from the selection with a predicate.

---

## 4. Markdown rendering

Files: `src/components/Markdown.tsx`, `src/components/MarkdownTable.tsx`, `src/utils/markdown.ts`, `src/utils/cliHighlight.ts`.

### 4.1 Mechanism: hybrid renderer
`marked.lexer(content)` produces a flat token list. The renderer walks tokens:
- `table` tokens → a `<MarkdownTable>` React component (flexbox columns, correct alignment),
- all other tokens → accumulated into a single ANSI string via `formatToken`, flushed as one `<Ansi>` node between tables.

Output is `<Box flexDirection="column" gap={1}>` of table components and `<Ansi>` blocks. `formatToken` (in `utils/markdown.ts`) is a recursive function switching on `token.type`: `paragraph` → text (wrapped), `heading` → bold + maybe a rule, `code` → fenced block with `highlight` applied, `list`/`list_item` → indentation + bullet/number, `blockquote` → a `│` bar prefix per line, `strong`/`em`/`codespan`/`link` → inline styles (links may become OSC-8 hyperlinks when the terminal supports them).

### 4.2 Mechanism: lexer caching (hot path on scroll)
`marked.lexer` costs ~3ms per message; `useMemo` doesn't survive unmount→remount, so scrolling back re-parses. Fix: a module-level LRU `tokenCache: Map<hash, Token[]>` keyed by `hashContent(content)`:
```ts
const hit = tokenCache.get(key)
if (hit) { tokenCache.delete(key); tokenCache.set(key, hit); return hit } // MRU promote
const tokens = marked.lexer(content)
if (tokenCache.size >= 500) tokenCache.delete(tokenCache.keys().next().value) // FIFO evict
tokenCache.set(key, tokens)
```
Messages are immutable in history, so same content → same tokens. MRU promotion prevents the eviction from dropping the very item you just scrolled back to.

### 4.3 Mechanism: syntax fast-path
`hasMarkdownSyntax(s)` uses one regex (`/#*`|[>\-_~]|\n\n|^\d+\. /`) sampled on the first 500 chars. If it fails, skip the full GFM parse and return a single paragraph token:
```ts
if (!hasMarkdownSyntax(content)) return [{ type: 'paragraph', raw: content, text: content, tokens: [{ type: 'text', raw: content, text: content }] }]
```
This avoids ~3ms on the majority of short plain-text responses.

### 4.4 Mechanism: streaming markdown (monotonic boundary split)
`StreamingMarkdown` keeps a `stablePrefixRef` (a `useRef('')`) that only ever grows. Each delta:
```ts
const stripped = stripPromptXMLTags(children)
if (!stripped.startsWith(stablePrefixRef.current)) stablePrefixRef.current = '' // defensive reset
const tokens = marked.lexer(stripped.substring(stablePrefixRef.current.length))
// last non-space token is the growing block; everything before is final
let last = tokens.length - 1
while (last >= 0 && tokens[last].type === 'space') last--
let advance = 0
for (let i = 0; i < last; i++) advance += tokens[i].raw.length
if (advance > 0) stablePrefixRef.current = stripped.substring(0, stablePrefixRef.current.length + advance)
```
It then renders `<Markdown>{stablePrefix}</Markdown>` + `<Markdown>{unstableSuffix}</Markdown>`. `marked.lexer` treats an unclosed code fence as a single token, so block boundaries are always safe — only the final growing block is re-lexed per delta (`O(unstable length)`, not `O(full text)`). The boundary only advances, so the ref mutation is idempotent under StrictMode double-render.

### 4.5 Mechanism: syntax highlighting
`MarkdownWithHighlight` suspends on `getCliHighlightPromise()` (a NAPI module) and renders `MarkdownBody highlight={highlight}`; if unavailable or `syntaxHighlightingDisabled`, it falls back to `highlight={null}`. `formatToken` threads `highlight` through so inline code and fenced blocks get language-aware coloring. `configureMarked()` disables strikethrough tokenizing (the model uses `~100` for "approximately", not strikethrough):
```ts
marked.use({ tokenizer: { del() { return undefined } } })
```

### 4.6 Mechanism: wrap correctness
`wrapText` (in `src/ink/wrap-text.ts`) uses `sliceAnsi` + `stringWidth` and retries with a tighter bound when a boundary-spanning wide char (CJK width 2) overshoots by one cell. `EOL = '\n'` unconditionally — Windows `\r\n` breaks the char→segment mapping in `applyStylesToWrappedText`, shifting styled text right. Truncation (`start`/`middle`/`end`) uses an ellipsis `…` and `sliceFit` to keep within `columns`.

---

## 5. Code diff rendering

Files: `src/components/StructuredDiff.tsx`, `src/components/StructuredDiff/Fallback.tsx`, `src/components/StructuredDiff/colorDiff.ts`, `src/components/HighlightedCode.tsx`, `src/components/FileEditToolDiff.tsx`, `src/components/diff/DiffDialog.tsx`.

### 5.1 Mechanism: native color-diff module
`color-diff-napi` exports `ColorDiff` and `ColorFile`. `ColorDiff(patch, firstLine, filePath, fileContent).render(theme, width, dim)` returns an array of **already ANSI-colored** lines (syntax-aware). The module is unavailable only when `CLAUDE_CODE_SYNTAX_HIGHLIGHT` is falsy; `expectColorDiff()` returns null then and the UI falls back to the JS path.

### 5.2 Mechanism: gutter split + NoSelect
`StructuredDiff` turns each rendered line into two columns:
```
gutterWidth = maxLineNumber.toString().length + 3   // marker(1) + 2 padding spaces
gutter = sliceAnsi(line, 0, gutterWidth)
content = sliceAnsi(line, gutterWidth)
```
It renders `<NoSelect fromLeftEdge><RawAnsi lines={gutters} width={gutterWidth}/></NoSelect>` next to `<RawAnsi lines={contents} width={safeWidth - gutterWidth}/>`. `NoSelect` marks cells non-selectable in alt-screen text selection, so click-drag over code copies clean content (line numbers and `+/-` sigils are excluded). On narrow terminals where `gutterWidth >= width`, the split is skipped (the Rust module already wraps to `width`). `RawAnsi` bypasses Ink's ANSI re-parsing (cheaper than `<Ansi>`), which is why the split matters for perf.

### 5.3 Mechanism: word-level diff (fallback path)
`StructuredDiffFallback` operates on `patch.lines` (each prefixed `+`, `-`, or space). It pairs related add/remove lines, then for each pair runs `diffWordsWithSpace` to get parts `{value, added?, removed?}`. Below `CHANGE_THRESHOLD = 0.4` similarity it shows word-level highlights:
- common parts: normal color,
- `removed` words: darker-red background,
- `added` words: darker-green background.

This shows *which words* changed inside a line rather than only which whole line changed. Above the threshold it shows plain line-level add/remove.

### 5.4 Mechanism: per-hunk render cache
Because ctrl+o remounts the tree (losing React memo), `StructuredDiff` caches at module scope:
```ts
type CachedRender = { lines: string[]; gutterWidth: number; gutters: string[] | null; contents: string[] | null }
const RENDER_CACHE = new WeakMap<StructuredPatchHunk, Map<string, CachedRender>>()
const key = `${theme}|${width}|${dim?1:0}|${gutterWidth}|${firstLine??''}|${filePath}`
```
The `WeakMap` keys on the immutable patch object; the inner `Map` keys on the render variant. A remount is therefore a WeakMap lookup + two `<RawAnsi>` leaves, not a fresh NAPI highlight + N `sliceAnsi` calls. The inner map is capped at 4 variants (width × dim) to bound accumulation during resize.

### 5.5 Mechanism: code block rendering
`HighlightedCode` builds a `ColorFile(code, filePath)` and calls `.render(theme, width, dim)` to get per-line ANSI. Width is measured from the parent box via `measureElement` (`measuredWidth = elementWidth - 2`). Each line becomes a `CodeLine` (gutter + content via `sliceAnsi`, wrapped in `NoSelect` for the gutter in fullscreen). If the highlighter is unavailable it renders `HighlightedCodeFallback`. In fullscreen it adds a line-number gutter width = `(countCharInString(code,'\n')+1).toString().length + 2`.

### 5.6 Mechanism: diff dialog UX
`diff/DiffDialog.tsx` + `DiffFileList.tsx` + `DiffDetailView.tsx` implement file-list → detail navigation for multi-file diffs (e.g. a `git` review): a sidebar lists changed files (with add/remove counts) and selecting one shows its `StructuredDiff` (or `StructuredDiffFallback`) in the detail pane. Keyboard nav moves between the list and the detail.

---

## 6. TUI decorations

Files: `src/components/design-system/Divider.tsx`, `src/ink/components/NoSelect.tsx`, `src/components/StatusLine.tsx`, `src/components/PromptInput/PromptInputFooter.tsx` (+ `PromptInputFooterSuggestions`, `PromptInputFooterLeftSide`, `PromptInputHelpMenu`), `src/components/Spinner/*`, `src/components/FullscreenLayout.tsx`.

### 6.1 Mechanism: dividers / section markers
`Divider` draws a horizontal line of `char` (default `─`) for `width` chars (terminal width minus `padding`), optionally with a centered `title`:
```
sideLen = floor((effectiveWidth - stringWidth(title) - 2) / 2)
render: '─'*sideLen + ' ' + title + ' ' + '─'*sideLen
```
Used for "unseen messages", compact boundaries, and tool-group separators. `stringWidth` (not `.length`) is used so multi-byte titles center correctly.

### 6.2 Mechanism: status line (top chrome)
`StatusLine` is gated by `statusLineShouldDisplay` (user must configure `statusLine`). Its content is produced by a **user-scriptable command** (`executeStatusLineCommand`) that emits fields: model, permission mode, cwd, cost, context-window %, rate limits. Because it's a hook, the chrome is customizable without code changes. It is hidden in assistant/daemon modes where it would reflect the wrong process.

### 6.3 Mechanism: prompt input footer (bottom chrome)
`PromptInputFooter` composes independent, memoized sub-bars: `PromptInputFooterLeftSide` (mode indicator, cost, suggestion count), `PromptInputFooterSuggestions` (a selectable `SuggestionItem[]` list with `selectedSuggestion`), `PromptInputHelpMenu` (keybinding help), plus `Notifications` (toasts), auto-updater status, vim-mode indicator, and bridge/MCP/teammate status pills. Each sub-component is memoized so a footer re-render (e.g. a new notification) is cheap and doesn't rebuild the suggestion list.

### 6.4 Mechanism: spinners / shimmer (liveness signal)
`Spinner/` is a small animation system with no layout cost — it only drives `Text` color/opacity:
- `SpinnerGlyph` renders a frame of a spinner charset advanced by a timer.
- `ShimmerChar`/`FlashingChar` interpolate between `messageColor` and `shimmerColor` by `flashOpacity` (0..1) using RGB lerp (`interpolateColor`), so a character "glimmers" between two theme colors.
- `useStalledAnimation` detects when a tool has run past a threshold and escalates the animation (e.g. from a calm spinner to a more urgent pulse).
- `GlimmerMessage` applies the shimmer to a whole line of text.

### 6.5 Mechanism: scroll-derived chrome (sticky header / pill)
`FullscreenLayout` holds a `ScrollChromeContext` fed by a `StickyTracker`. When the user scrolls up away from the bottom, the tracker writes context (e.g. the pinned prompt text, or an "N new messages" pill) into the context, and a sticky header/pill renders at the top. `UnseenDivider` (`─── N new ───`) tracks the first unseen message by a UUID prefix and `shiftDivider(indexDelta, heightDelta)` adjusts as messages are inserted/removed above it. This keeps orientation without a permanently reserved header bar that would cost a row at all times.

### 6.6 Mechanism: NoSelect (selection hygiene)
`NoSelect` sets a `noSelect` attribute (or `from-left-edge`) on its `<Box>`, telling the alt-screen selection engine to skip those cells when computing the selection highlight and the copied text. Used for gutters, list bullets, and diff sigils. It is a no-op in main-screen scrollback, where the terminal's native selection is used instead. See §5.2 for the diff usage.

---

## 7. UI / quality enhancements

Cross-cutting techniques that make the TUI feel smooth at scale. jie-tui should adopt the *patterns*, not necessarily the NAPI modules.

### 7.1 Mechanism: defer work off the React reconciler
- Scroll/wheel mutate the DOM node + `queueMicrotask(scheduleRenderFrom)` instead of `setState` ([§2.2](#22-mechanism-scrollbox-scroll-state-on-the-dom-node)).
- `markScrollActivity()` signals background intervals (IDE poll, LSP poll) to skip their next tick during scroll drain — they were causing 1402ms frame gaps during scroll.
- Render quantization ([§2.4](#24-mechanism-scroll-quantization-to-avoid-react-commit-storms)) keeps wheel smooth without committing React per event.

### 7.2 Mechanism: memo discipline & stable closures
- `VirtualItem` threads *stable* `onClickK/onEnterK/onLeaveK` via `itemKey` so per-item closures are cheap and don't close over `msg/idx` (lets the JIT inline them). Per-item closures in `MessageRow` were measured at 16% of GC time during fast scroll.
- `LogoHeader` is `memo`'d so it doesn't go dirty on every `Messages` re-render — otherwise `renderChildren`'s dirty cascade disables prevScreen blitting for all siblings (150K+ writes/frame at ~2800 messages).
- `useVirtualScroll` caps `MAX_MOUNTED_ITEMS = 300` and slides the range by `SLIDE_STEP = 25` per commit to bound sync-block time.

### 7.3 Mechanism: module-level caches
Because ctrl+o remounts the tree and React memo is lost, expensive results live at module scope, keyed so they self-GC:
- `tokenCache` (markdown lexer, [§4.2](#42-mechanism-lexer-caching-hot-path-on-scroll)) — keyed by content hash.
- `RENDER_CACHE` (diff render, [§5.4](#54-mechanism-per-hunk-render-cache)) — keyed by the immutable patch object (WeakMap).
- `promptTextCache` (a `WeakMap` of sticky-prompt text) so per-scroll-tick walks don't re-parse system-reminder strips. Messages are append-only and immutable, so a WeakMap hit is always valid and the entry self-GCs on compaction.

None of these retain full text unnecessarily — keys are hashes or the immutable source object, and values are the parsed/rendered form.

### 7.4 Mechanism: measurement & height estimation
- `measureElement(el)` returns the Yoga-computed `{width, height}` after layout.
- `useVirtualScroll` uses `DEFAULT_ESTIMATE = 3` rows for unmeasured items — **intentionally low**, because overestimating causes blank space (stop mounting too early) while underestimating only mounts a few extra items into overscan. The asymmetry favors "err low".
- `OVERSCAN_ROWS = 80` (real heights can be 10× the estimate for long tool results), `COLD_START_COUNT = 30` items before layout, `PESSIMISTIC_HEIGHT = 1` for the coverage back-walk (guarantees the mounted span reaches the viewport bottom).
- `getFreshScrollHeight()` reads Yoga directly (`content.yogaNode.getComputedHeight()`) for a value not stale by the render throttle — needed in `useLayoutEffect` right after a commit that grew content.

### 7.5 Mechanism: cursor anchoring (the 1-row-off fix)
The forked Ink lets the editor declare a cursor *relative to its own Yoga node* ([§1.3](#13-mechanism-how-the-cursor-rect-is-resolved)); the renderer resolves it to absolute using `nodeCache`. No `useWindowSize().rows` arithmetic, immune to resize/scroll/prompt-mode changes — if the editor moves, the cursor follows because the rect is read fresh each frame. This is the direct, robust fix for the class of bug where `useCursor()` + row arithmetic lands the caret one row off.

### 7.6 Mechanism: text selection (copy/paste)
In alt-screen mode, `use-selection` + `use-copy-on-select` track the dragged cell range; `NoSelect` (§6.6) excludes gutters. `ScrollKeybindingHandler` decides which keys clear selection, mimicking native terminals: bare arrows clear; modified nav (`shift`/`opt`/`cmd` + arrow/home/end) preserves it; wheel events are excluded (cleared via the scroll path). `getClipboardPath()` predicts whether native / tmux-buffer / OSC-52 copy will work and shows a tailored toast ("paste with prefix + ]" for tmux).

### 7.7 Mechanism: keyboard ergonomics
- PgUp/PgDn scroll by half-viewport; any scroll breaks sticky; Ctrl+End re-pins to bottom; `g/G` and `ctrl+u/d/b/f` work in modal (transcript) mode where no text input competes for those keys.
- `VirtualMessageList` builds its key array with an **append-only delta push**: if the prefix matches, only push the new keys; otherwise rebuild on compaction/clear/`itemKey` change. Rebuilding the full string array every commit is O(n) churn (~1MB at 27k messages).
- Transcript search: `scanElement` paints the DOM to a fresh `Screen` and scans for matches; `setPositions` drives a 1-based `current/total` highlight via index arithmetic + `scrollToIndex`. `onSearchMatchesChange(count, current)` updates the UI.

---

## 8. What jie-tui can and cannot take

**Can take (patterns, pure logic, no fork needed):**
- The two-layer virtualization concept and its constants/tradeoffs ([§2.1](#21-two-layer-virtualization), [§7.4](#74-mechanism-measurement--height-estimation)): prefix-sum `offsets`, binary-search range, spacer boxes, low `DEFAULT_ESTIMATE`, overscan, `SLIDE_STEP` slide.
- Markdown lexer caching + syntax fast-path + monotonic streaming boundary split ([§4](#4-markdown-rendering)).
- Word-level diff + gutter/`NoSelect` selection hygiene ([§5](#5-code-diff-rendering)).
- Divider/footer/spinner decoration composition and memo-discipline ([§6](#6-tui-decorations), [§7.2](#72-mechanism-memo-discipline--stable-closures)).
- UUID-anchored slice instead of count-slicing ([§3.3](#33-mechanism-uuid-anchored-render-caps)).
- Render quantization + deferring scroll off React ([§2.2](#22-mechanism-scrollbox-scroll-state-on-the-dom-node), [§2.4](#24-mechanism-scroll-quantization-to-avoid-react-commit-storms)).

**Cannot take directly (needs the forked Ink or a renderer change):**
- `ScrollBox`, `CursorDeclarationContext`, `useDeclaredCursor`, `nodeCache` — stock Ink exposes none of these. Adopting them means vendoring Claude Code's `ink/` fork as a separate package (deep React reconciler integration, large blast radius) or patching upstream Ink to add a node-relative `useCursor` mode.
- Smooth wheel acceleration, drag-to-scroll, sticky re-pin during render phase — all depend on `pendingScrollDelta` draining + renderer-position reads that stock Ink doesn't expose.
- The absolute cursor fix ([§7.5](#75-mechanism-cursor-anchoring-the-1-row-off-fix)): jie-tui v0.2's pragmatic answer is the `caretPositionForCursor(buffer, rows)` arithmetic formula in `packages/jie-tui/components/panel/editor.tsx` (re-exported as `_caretPositionForCursor` for testing). The formula encodes Ink's 1-indexed `y` convention: trailing content row at `y = rows - footerLines - borderLines - (trailingLineIndex)` for a single-line editor on a `rows`-row terminal. Revisit when a second input field or a band between editor and footer appears (see `addrs/27`); at that point forking Ink is justified.

**Decisions jie-tui should make explicitly:**
- Whether to vendor the forked Ink (enables §2 / §7.5 properly) vs. keep the pragmatic arithmetic formula.
- Whether syntax highlighting needs a NAPI module like `color-diff-napi` or a pure-JS highlighter is acceptable for the target throughput.
- Whether text selection (alt-screen copy/paste) is in scope for v0.x — it pulls in `NoSelect`, `use-selection`, and the decoration discipline in §5.2/§6.6.
