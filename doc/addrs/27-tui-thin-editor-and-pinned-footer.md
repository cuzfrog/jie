# ADR 27: TUI Editor is One Line by Default; Footer Pinned via flexGrow

## Status

Superseded by ADR 30 (2026-07). The ink-era implementation it describes (`layout.tsx` bands, `editor-view.ts` inverse-video caret, panel scroll viewport) was deleted in the pi-tui migration. The layout decisions themselves survive — thin editor that grows per newline, two-line pinned footer — now realized with pi-tui components; see `doc/specs/ui/tui-layout.md`.

## Decision

### 1. `Layout` pins the footer via `flexGrow`

Three bands in `packages/jie-tui/components/layout.tsx`: the body row (`flexGrow={1}`, agents rail + chat pane), the editor (natural height), and the footer (natural 2 rows). The body absorbs whatever vertical space remains, so the footer lands on the terminal's last two rows for any `rows` value — no spacer rows, no height arithmetic in `Layout`.

### 2. The editor is one line by default and grows per newline

`packages/jie-tui/components/editor/`: a single content row plus top and bottom borders (`borderStyle="single"` with `borderLeft/Right={false}` — ink's `render-border` only emits characters when the style is non-empty, so this is the supported way to draw "top + bottom only"). Each `\n` adds one content row; height is capped by `MAX_EDITOR_CONTENT_ROWS`, past which the buffer scrolls inside the panel (the viewport window always ends at the cursor line, so typing never goes off-panel). Horizontal rules match the design language — vertical `│` columns would imply a column-adjacent box, but the editor spans the full width.

### 3. The caret is ANSI inverse video, in-frame

`editor-view.ts` renders the cursor as a reverse-video grapheme (`\u001b[7m] … \u001b[27m]`) at `buffer.cursorLine/cursorCol` — a block on empty positions, the inverted grapheme under one otherwise. The OS terminal caret is not positioned.

## Rationale

- **A pinned footer matches user intuition.** The most recent status (identity / model / shortcut hint) belongs at the bottom edge; `flexGrow` is the right tool once editor height is natural — there is nothing left to compute.
- **A thin editor matches input reality.** Most prompts are one line; a tall reserved box encourages whitespace padding. Multi-line growth still serves pasted prompts.
- **Inverse video is layout-neutral.** The caret lives inside the rendered frame, so it needs no OS-caret row arithmetic — which would have to re-anchor every time the buffer scrolls inside the panel or a band height changes — and stays correct through wrap-ansi reflow and panel scrolling. The cost is one cell of the character grid.
- **`paddingX=1` is fixed, not derived.** The editor's band is always `width="100%"`, so the caret's column is a constant plus the trailing segment's length.

## Consequences

- `components/layout.tsx` — three bands; the prototype's `editorHeightFor` / `bodyHeightFor` / spacer constants are gone.
- `components/editor/` — `editor-state.ts` / `editor-reducer.ts` own the buffer and cursor; `editor-view.ts` renders lines with the inverted caret and computes the scroll viewport.
- `doc/specs/ui/tui-layout.md` describes the three bands, natural editor height, and the pinned footer.
- Open: if a band is ever added below the editor, the "editor is the bottom-most band" assumption in the viewport math needs re-anchoring.
