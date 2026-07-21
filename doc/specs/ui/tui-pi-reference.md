# Pi TUI Theme and Font Reference

Precise spec, extracted from pi's published theme tokens. Use this to imitate pi's TUI look. Where pi uses a token, the table below records the resolved value as it ships in `dark.json` and `light.json` — not the schema name. Hex and 256-color indices are both given so we can target truecolor terminals and the 256-color fallback. 256-color indices were computed by pi's own `rgbTo256()` (in `theme.ts`) on the dark.json hex values.

**Adoption note.** jie adopts pi's token NAMES (`accent`, `muted`, `borderMuted`, `thinkingText`, `warning`, `error`, and the rest of the Core UI / backgrounds set) but NOT its hex/256 values: `packages/jie-tui/components/themes.ts` maps each token to a plain Ink color name (`cyan`, `gray`, `red`, `yellow`, `white`, `blue`, `green`). The hex/256 columns below document pi only.

## 1. Theme tokens

### Core UI

| Token            | dark hex  | dark 256 | light hex | light 256 | What it styles                                                                                    |
| ---------------- | --------- | -------- | --------- | --------- | ------------------------------------------------------------------------------------------------- |
| `accent`         | `#8abeb7` | 109      | `#5a8080` | 66        | Logo, working spinner, autocomplete selected prefix/text, settings selected label/value, "▌" cursor in settings, scope-group headers, "What's New" pill when not collapsed |
| `border`         | `#5f87ff` | 69       | `#547da7` | 67        | Default border color for the editor (`getEditorTheme().borderColor` = `borderMuted`, see below; `border` is used by `DynamicBorder` default, `BorderedLoader`, reload box, extension borders) |
| `borderAccent`   | `#00d7ff` | 51       | `#5a8080` | 66        | Reserved for accent borders; not actively used by built-in components                              |
| `borderMuted`    | `#505050` | 240      | `#b0b0b0` | 249       | Single-line editor border (`EditorTheme.borderColor`); the only editor border in normal state    |
| `success`        | `#b5bd68` | 106      | `#588458` | 65        | Success path/diagnostic marker: `✓` (theme.ts `getCliHighlightTheme` is not used here — direct `theme.fg("success", …)` in `interactive-mode.ts:1304`) |
| `error`          | `#cc6666` | 131      | `#aa5555` | 131       | Error text, "(exit N)" status, "Error: …" trailing line on `stopReason === "error"`, length-stop, abort |
| `warning`        | `#ffff00` | 226      | `#9a7326` | 137       | `(cancelled)` status, conflict/issue headers in loaded-resources, context % > 70 %, "xp" badge   |
| `muted`          | `#808080` | 244      | `#6c6c6c` | 242       | Autocomplete description/scrollInfo/noMatch, footer extension statuses, settings unselected value, shell header subtitle ("Run…"), bash output (`fg("muted", line)`), default `getSelectListTheme` description |
| `dim`            | `#666666` | 241      | `#767676` | 243       | Version string after logo, group path labels, footer pwd line, footer stats, keybinding hint suffix, `(sub)` indicator, "Model scope: …" startup notice, dim helper for stack trace |
| `text`           | `#d4d4d4` | 252      | `#1f2328` | 235       | Base text color for all unstyled content; userMessageText equals text                              |
| `thinkingText`   | `#808080` | 244      | `#6c6c6c` | 242       | Color applied to thinking-block text when `italic: true` is set as the `Markdown` default style   |

### Backgrounds & content text

| Token              | dark hex  | dark 256 | light hex | light 256 | What it styles                                                              |
| ------------------ | --------- | -------- | --------- | --------- | --------------------------------------------------------------------------- |
| `selectedBg`       | `#3a3a4a` | 237      | `#d0d0e0` | 251       | Reserved (set as a `bg` token, but the built-in select list only uses `accent`/`muted` for fg) |
| `userMessageBg`    | `#343541` | 236      | `#e8e8e8` | 254       | Background of the entire user-message `Box` (1-cell inset)                   |
| `userMessageText`  | `#d4d4d4` | 252      | `#1f2328` | 235       | Foreground of user message content                                          |
| `toolPendingBg`    | `#282832` | 235      | `#e8e8f0` | 255       | Background of a tool execution while args are still streaming (partial)     |
| `toolSuccessBg`    | `#283228` | 235      | `#e8f0e8` | 255       | Background after a tool returns without error                                |
| `toolErrorBg`      | `#3c2828` | 237      | `#f0e8e8` | 255       | Background when the tool result has `isError: true`                          |
| `toolTitle`        | `#d4d4d4` | 252      | `#1f2328` | 235       | Tool name in the default (no custom renderer) call/result fallback            |
| `toolOutput`       | `#808080` | 244      | `#6c6c6c` | 242       | Plain text tool output when no `renderResult` is provided; fallback color for unsupported inline images |

### Markdown

| Token              | dark hex  | dark 256 | light hex | light 256 | What it styles                                                |
| ------------------ | --------- | -------- | --------- | --------- | ------------------------------------------------------------- |
| `mdHeading`        | `#f0c674` | 221      | `#9a7326` | 137       | `# / ##` headings (h1 is bold+underline, h2+ is bold only); also used as the section header color `[Context]`, `[Skills]`, `[Prompts]`, etc. in loaded-resources |
| `mdLink`           | `#81a2be` | 110      | `#547da7` | 67        | Hyperlink text (always underlined)                             |
| `mdLinkUrl`        | `#666666` | 241      | `#767676` | 243       | URL fallback when terminal has no OSC 8 hyperlink support     |
| `mdCode`           | `#8abeb7` | 109      | `#5a8080` | 66        | Inline `code` spans                                           |
| `mdCodeBlock`      | `#b5bd68` | 106      | `#588458` | 65        | Lines inside fenced code blocks when no `highlightCode`/language |
| `mdCodeBlockBorder`| `#808080` | 244      | `#6c6c6c` | 242       | The opening/closing ``` ``` ` fence lines                      |
| `mdQuote`          | `#808080` | 244      | `#6c6c6c` | 242       | Body of `>` blockquote lines (rendered with italic)            |
| `mdQuoteBorder`    | `#808080` | 244      | `#6c6c6c` | 242       | The `│` prefix on every blockquote line                        |
| `mdHr`             | `#808080` | 244      | `#6c6c6c` | 242       | Horizontal rule (`─` repeated up to 80 cells or width)        |
| `mdListBullet`     | `#8abeb7` | 109      | `#588458` | 65        | Ordered/unordered list marker (`- `, `1. `, task `[x]/[ ]`)    |

### Tool diffs

| Token              | dark hex  | dark 256 | light hex | light 256 | What it styles                                       |
| ------------------ | --------- | -------- | --------- | --------- | ---------------------------------------------------- |
| `toolDiffAdded`    | `#b5bd68` | 106      | `#588458` | 65        | Green `+` lines in diff output                      |
| `toolDiffRemoved`  | `#cc6666` | 131      | `#aa5555` | 131       | Red `-` lines in diff output                        |
| `toolDiffContext`  | `#808080` | 244      | `#6c6c6c` | 242       | Unchanged context lines                             |

### Syntax highlighting

| Token              | dark hex  | dark 256 | light hex | light 256 | What it styles                                       |
| ------------------ | --------- | -------- | --------- | --------- | ---------------------------------------------------- |
| `syntaxComment`    | `#6A9955` | 107      | `#008000` | 28        | `//`, `#`, `--` comments                             |
| `syntaxKeyword`    | `#569CD6` | 75       | `#0000FF` | 21        | `if`, `for`, `return`, language keywords             |
| `syntaxFunction`   | `#DCDCAA` | 187      | `#795E26` | 137       | Function names in declarations/calls                 |
| `syntaxVariable`   | `#9CDCFE` | 117      | `#001080` | 19        | Identifiers, attributes, parameters                  |
| `syntaxString`     | `#CE9178` | 173      | `#A31515` | 124       | String literals, regex                              |
| `syntaxNumber`     | `#B5CEA8` | 151      | `#098658` | 28        | Numeric literals                                    |

### Thinking-level borders (used by editor border when text starts with thinking-level prefix)

The editor's border color flips to a thinking-color while the user is typing a `<think>` style trigger. The mapping is in `theme.ts:399-417` and the assignment is at `interactive-mode.ts:3576`.

| Token              | dark hex  | dark 256 | light hex | light 256 |
| ------------------ | --------- | -------- | --------- | --------- |
| `thinkingOff`      | `#505050` | 240      | `#b0b0b0` | 249       |
| `thinkingMinimal`  | `#6e6e6e` | 242      | `#767676` | 243       |
| `thinkingLow`      | `#5f87af` | 67       | `#547da7` | 67        |
| `thinkingMedium`   | `#81a2be` | 110      | `#5a8080` | 66        |
| `thinkingHigh`     | `#b294bb` | 139      | `#875f87` | 96        |
| `thinkingXhigh`    | `#d183e8` | 170      | `#8b008b` | 90        |

Bash-mode border is also driven by theme: `bashMode` → dark `#b5bd68`, light `#588458` (used both for the `$ command` header and for `DynamicBorder` around the bash block, and for the editor border when text starts with `!`).

## 2. Font treatments

- *italic* — pi uses italic in exactly three places:
  - `thinkingText`-colored thinking blocks, when rendered as visible markdown (`assistant-message.ts:113-115`, with `italic: true` passed into the `Markdown` constructor's `DefaultTextStyle`).
  - The single-line static "Thinking..." placeholder when thinking is hidden (`assistant-message.ts:104`, also `thinkingText`-colored).
  - All blockquote body text (`markdown.ts:415`, `this.theme.quote(this.theme.italic(text))`).
  - Markdown emphasis (`_text_` / `*text*`) also renders italic via `this.theme.italic` (`markdown.ts:529`).
- *dim / faint* — applied with `theme.fg("dim", …)` for the version string after the logo (`interactive-mode.ts:667`), startup `Press …` hint, footer pwd line, footer stats, model-scope notice, stack-trace dump in `showExtensionError` (`interactive-mode.ts:2437`). Not via SGR `2` directly.
- *bold* — used for: logo, "What's New" header, tool name in default fallback (`tool-execution.ts:136`), `$ command` header in bash execution, keybinding label in `keyHint`, table header cells (`markdown.ts:817`), markdown strong (`markdown.ts:523`), `app.session.new` shortcut (`Ctrl+L` for clear).
- *strikethrough* — only used by markdown strikethrough (`~~text~~`); the dark/light themes do not redefine this color, it goes through `chalk.strikethrough` directly (`theme.ts:1235`). The custom `StrictStrikethroughTokenizer` requires non-whitespace adjacent to the tildes.
- *underline* — markdown link text (`markdown.ts:539`, `this.theme.link(this.theme.underline(linkText))`) and h1 headings (`markdown.ts:345`). OSC-8 hyperlinks take precedence when the terminal supports them.
- *busy/working indicator* — `Loader` with default frames `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]` (10-frame braille spinner), 80 ms per frame (`packages/tui/src/components/loader.ts:11-12`). Spinner color is `accent`; the message text is `muted` (`interactive-mode.ts:1752-1758`). Default message: `"Working..."`. When an interrupt key is available the running text is `"Working... (Esc to interrupt)"` (`interactive-mode.ts:1886`).
- *thinking indicator* — there is no spinner attached to the streaming thinking block. While a response is streaming and thinking is shown, the visible thinking block is the live `Markdown(content.thinking.trim(), …)` styled with `thinkingText` + italic (`assistant-message.ts:112`). When `hideThinkingBlock` is set (`/settings` toggle), pi replaces the whole block with a single italic `thinkingText` line: `"Thinking..."` (`assistant-message.ts:103-105`, default label at `interactive-mode.ts:292`). The braille spinner lives separately, in the status container (`statusContainer`), and is the working indicator, not the thinking indicator.

## 3. Separator conventions

- Character: the box-drawing horizontal `─` (U+2500). Never `━` (U+2501) or `═`.
- Locations and colors:
  - Single-line editor top/bottom border: `editor.borderColor` which is `borderMuted` (dark `#505050` / light `#b0b0b0`) — see `theme.ts:1271`. Editor.ts uses `this.borderColor("─")` at the top, then `"─".repeat(width)` for the rule (`editor.ts:476-518, 573-575`).
  - `DynamicBorder`: renders `"─".repeat(Math.max(1, width))` (`dynamic-border.ts:23`). Default color is `border` (`#5f87ff` dark / `#547da7` light). Used inside `bash-execution.ts` (top + bottom, color = `bashMode` or `dim` for `!!`), `BorderedLoader` (`border`), and around sections that need a thin rule.
  - Markdown `---` hr: `─` repeated up to `min(width, 80)` (`markdown.ts:464`), color = `mdHr`.
  - Inside a markdown table: `┌─…─┬─…─┐`, `├─…─┼─…─┤`, `└─…─┴─…─┘` borders drawn with `─` (`markdown.ts:803-851`); not theme-colored, raw glyphs.
- No vertical rail-and-chat separator is used in the built-in TUI. There is no `│` column between the chat and any side panel because there is no side panel — pi's TUI is a single column.

## 4. Rail styling

Jie's rail is a net-new surface — pi has no rail in the built-in TUI. The jie-specific color choices for the rail live in `tui-layout.md` "Rail styling". This doc only lists pi's tokens; the application of those tokens to the rail is a jie-side decision.

## 5. Footer styling

Two lines (sometimes three, with extension statuses). See `FooterComponent.render` at `footer.ts:83-244`.

- Line 1 — pwd line. Color: `dim`. Content: `~/relative/path (branch) • sessionName`. `~` replaces `$HOME`; `formatCwdForFooter` (`footer.ts:31-43`). Branch appended in parentheses when `footerData.getGitBranch()` returns a value (`footer.ts:120-123`). Session name appended with `•` separator when set (`footer.ts:126-129`).
- Line 2 — stats + model. Color: `dim` for both halves. The stats are space-separated tokens:
  - `↑{input}` `↓{output}` `R{cacheRead}` `W{cacheWrite}` (when non-zero). `formatTokens` (`footer.ts:23-29`): `<1k` raw, `<10k` one decimal k, `<1M` rounded k, `<10M` one-decimal M, else rounded M.
  - `CH{hitRate}%` cache hit rate (when either cache field is non-zero).
  - `$$.$$$` total cost, suffixed ` (sub)` when using OAuth subscription.
  - Context usage: `{pct}%/{ctxWindow}{autoIndicator}` where `autoIndicator = " (auto)"` when auto-compaction is enabled. The percentage color overrides the dim wrapper:
    - `> 90%` → `error` (`footer.ts:155-156`).
    - `> 70%` → `warning` (`footer.ts:157-158`).
    - else → no color (inherits the dim wrapper).
  - When experimental features are enabled, a separate `• {bold(warning("xp"))}` chunk is appended.
  - Right side: `modelName`, optionally prefixed `(provider) ` when there are multiple providers and width allows, with ` • thinkingLevel` (or ` • thinking off`) when the model supports reasoning (`footer.ts:184-199`).
- Optional line 3 — extension statuses. Color: `dim`. Each entry is sanitized (no newlines/tabs) and joined with single space, sorted alphabetically by key, truncated to width with dim `...` (`footer.ts:233-242`).

## 6. Editor

The single-line prompt is a `CustomEditor extends Editor` (`custom-editor.ts`) using `EditorTheme` from `getEditorTheme()` (`theme.ts:1269-1274`).

- Border character: `─`. Top + bottom borders wrap the prompt lines (`editor.ts:476-518, 568-575`). When scrolled past the visible window, the borders become indicator bars (`─── ↑ N more ───` / `─── ↓ N more ───`), still in `borderColor`.
- Border color: `borderMuted` in normal state (`theme.ts:1271`). When the typed text starts with `!`, the border switches to `bashMode` (`interactive-mode.ts:3573`). When the typed text starts with `▊` (or the thinking-level trigger), the border switches to the per-level `thinkingOff..thinkingXhigh` color (`interactive-mode.ts:3576`, mapping in `theme.ts:399-417`).
- Placeholder text: pi's editor has no placeholder string. The empty state is just the two `─` rules and an empty line. "Busy" is communicated by a separate `Loader` shown in the `statusContainer` (between chat and editor) — not inside the editor box. The editor border color does not change to indicate busy.
- Busy state inside the editor: the editor itself stays interactive. The working indicator (`Loader` at `interactive-mode.ts:1752-1758`) is rendered in a separate `statusContainer` immediately above the editor container. While the agent is streaming, the spinner shows `accent`-colored braille + `muted` message, default `"Working..."`. When streaming is interrupted by an extension, the message becomes `"Working... (Esc to interrupt)"`.

## 7. Markdown rendering

Component: `Markdown` from `@earendil-works/pi-tui`, source at `packages/tui/src/components/markdown.ts`.

- **Auto-wrap**: yes. After tokenizing, each line is wrapped to the available content width via `wrapTextWithAnsi(line, contentWidth)` (`markdown.ts:194-199`). CJK is allowed to break between adjacent characters (`editor.ts:188-198` for the editor; the markdown wrap helper `wrapTextWithAnsi` is the same code path used elsewhere in pi-tui). Long single tokens that exceed the wrap width are character-broken by `wordWrapLine` (`editor.ts:162-179`).
- **Code blocks**: yes. Token type `code`. Renders the fence (`\`\`\`{lang}`) with `codeBlockBorder`, then either calls `theme.highlightCode(code, lang)` (when present) or falls back to `codeBlock` per line. Closing fence is `codeBlockBorder("```")`. A blank line is added after the block unless the next token is `space` (`markdown.ts:378-398`).
- **Lists**: yes. Both ordered and unordered, plus GFM task lists `[x]` / `[ ]`. The bullet/marker is wrapped in `listBullet` color; subsequent lines use a continuation indent of the same width as the marker (`markdown.ts:600-654`).
- **Headings**: yes. h1 is `heading(bold(underline(text)))`, h2 is `heading(bold(text))`, h3+ renders the `# ` prefix in heading color and the body in heading+bold (`markdown.ts:336-362`). Inline tokens inside a heading restore the heading style after their own ANSI resets (via `InlineStyleContext`).
- **Blockquotes**: yes. Renders `│ ` prefix in `quoteBorder` color, body in `quote+italic`. Nested block tokens (lists, code) render recursively inside the quote (`markdown.ts:414-461`).
- **Tables**: yes. GFM pipe tables with auto-sized columns and width-aware cell wrapping; borders are raw `┌─┬─┐ ├─┼─┤ └─┴─┘` glyphs, not theme-colored (`markdown.ts:685-857`).
- **Horizontal rule**: `─` repeated up to `min(width, 80)` in `hr` color (`markdown.ts:464`).
- **Inline formatting**: bold/italic/strikethrough/underline/code-span are mapped through `theme.bold`/`theme.italic`/`theme.strikethrough`/`theme.underline`/`theme.code` (`markdown.ts:521-566`). Strikethrough uses a custom `StrictStrikethroughTokenizer` that requires non-whitespace adjacent to `~~` (`markdown.ts:6-23`).
- **Hyperlinks**: prefer OSC 8 when the terminal supports it (`markdown.ts:540-543`). Otherwise print `text (url)` where the URL is in `linkUrl` color (`markdown.ts:549-554`).
- **Images**: detected via `isImageLine` and passed through unwrapped (`markdown.ts:192, 208-209`).
- **`codeBlockIndent` default**: `"  "` (two spaces). The override path is `theme.codeBlockIndent` (`markdown.ts:95`); pi sets it from `settingsManager.getCodeBlockIndent()` in `interactive-mode.ts:956-961`.

## Where to look in pi

- Theme JSON (the values cited above): pi's `coding-agent/src/modes/interactive/theme/dark.json` (1-86), `coding-agent/src/modes/interactive/theme/light.json` (1-85).
- Theme loader, 256-color fallback, accessor methods (`fg`, `bg`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`, `getThinkingBorderColor`, `getBashModeBorderColor`): pi's `coding-agent/src/modes/interactive/theme/theme.ts` (1-1285). Mapping of `ThemeColor`/`ThemeBg` to bg vs fg at `theme.ts:592-606`.
- Footer layout, color, and stats composition: pi's `coding-agent/src/modes/interactive/components/footer.ts` (1-246).
- Assistant message rendering (text + thinking block, italic-thinking behavior): pi's `coding-agent/src/modes/interactive/components/assistant-message.ts` (1-156).
- User message background + foreground: pi's `coding-agent/src/modes/interactive/components/user-message.ts` (1-42).
- Tool execution block (background swap on pending/success/error): pi's `coding-agent/src/modes/interactive/components/tool-execution.ts` (1-377), especially the `updateDisplay` switch at `tool-execution.ts:253-259`.
- Markdown component API and renderer: pi's `tui/src/components/markdown.ts` (1-858). `MarkdownTheme`/`MarkdownOptions`/`DefaultTextStyle` interfaces at `markdown.ts:59-103`. Heading/list/blockquote/code/hr/table rendering at `markdown.ts:327-654, 685-857`.
- Loader / spinner frames and timing: pi's `tui/src/components/loader.ts` (1-92). Default frames at `loader.ts:11-12`.
- Editor border rendering and indicator bars: `~/workspace/pi/pi/packages/tui/src/components/editor.ts` (lines 221-335 for the theme interface and border field; lines 460-580 for `render()`). The border color is overridable at runtime by `interactive-mode.ts:3573-3576` for bash / thinking-mode triggers.
- `DynamicBorder` (the `─` rule used in bash blocks, bordered loaders, and section dividers): `~/workspace/pi/pi/packages/coding-agent/src/modes/interactive/components/dynamic-border.ts` (1-25).
- Bash execution frame (uses DynamicBorder with `bashMode` or `dim` color): `~/workspace/pi/pi/packages/coding-agent/src/modes/interactive/components/bash-execution.ts` (1-220).
- Working-indicator wiring (spinner color = `accent`, message color = `muted`, default message = `"Working..."`): `~/workspace/pi/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts` (1-5756), particularly `defaultWorkingMessage` and `defaultHiddenThinkingLabel` at `interactive-mode.ts:291-293`, and the `Loader` construction at `interactive-mode.ts:1751-1758`.
