# TUI Layout (v0.2)

The v0.2 prototype's spatial design. Sibling of `tui-shortcuts.md` (keybindings), `tui-state.md` (data model), and `tui-pi-reference.md` (theme tokens). The parent doc is `tui-overview.md`; this doc captures the layout decisions.

Example:
```text
› Tell me a story
● Marry had a little lamb.
⠋ Working…
────────────────────────────────────────────────────────────────────────────────
 hello world
────────────────────────────────────────────────────────────────────────────────
~/workspace/jie (main)                                           my-team:agent-1
0%/200k                                            (anthropic) opus-4.8 | max
```

## Single inline column

The TUI renders a single full-width column of stacked sections, top to bottom: chat, todos, working indicator, status line, keybinding hints (empty state), editor, footer (composed by `components/layout.ts`, wired by `components/view.ts`). Rendering is **inline into the normal terminal buffer** (pi-tui; no alternate screen): finished conversation output scrolls away as ordinary terminal scrollback, and selection/copy is the terminal's own. There is no rail, no app-level scrollback buffer, no mouse/wheel handling. Agent visibility that the rail used to provide lives in the footer (focused agent, per-agent model) plus the agent-cycle keys (`tui-shortcuts.md`).

Reference terminal: **80 cols**. Every section spans the full width; every custom component truncates each rendered line to the given width (pi-tui's `doRender` throws on over-wide lines — this is pinned by per-component fuzz tests).

## Chat

The chat section is append-only: `sync/chat-sync.ts` subscribes to the state store and performs **structural ops only** (append/finalize/clear child components per agent, keyed on `history.length`, `currentTurn` identity, `cards.length`, `blocks.length`) — components pull their own slice from the store in `render(width)`, so streamed text updates in place. The focused agent's history + current turn render top-to-bottom; each turn is:

1. **User prompt** — prefixed with `› ` in `userMessageIcon` color (cyan); continuation lines indent 2 columns. Rendered **verbatim** (no markdown interpretation).
2. **Assistant text block** — prefixed with `● ` in `assistantMessageIcon` color (accent); continuation lines indent 2 columns. Rendered through pi-tui's `Markdown` with `jieMarkdownTheme()` (`themes.ts`): headings, bold/italic, lists, code spans, fenced code, quotes, and links all style. OSC-8 hyperlinks are gated on `INK_OSC8=1` (capabilities set at startup).
3. **Thinking block** (one or many) — collapsed renders a single italic `Thinking...` line in `thinkingText`; expanded renders the markdown body recolored to `thinkingText` + italic. `Ctrl+T` expands / collapses all (`state.thinkingExpanded`).
4. **Tool cards** (`tool-call` + matching `tool-result`) — one header line when collapsed (`✓`/`✗` glyph, name, duration); expanded shows input, output (the reducer unwraps `{content, details, terminate}` envelopes to the string content), and a diff view when the result carries one. `Ctrl+O` expands / collapses all (`state.toolCardsExpanded`).

The **todo list** renders as its own section below the chat (the focused agent's `agent.todos`, replaced wholesale when a todo-tool result arrives). The **working indicator** (a pi-tui `Loader`, accent spinner + `Working…` label) is mounted in its slot while **any** agent is `busy` and removed the moment all agents are idle.

The **status line** section sits between the working slot and the editor: the transient message row (`muted`, aged out after 5 s render-side) and the error banner row (`error`), each only when present.

The **keybinding hints** section sits between the status line and the editor and renders only while the conversation is empty — no agent has history or an in-progress turn (`currentTurn === null`). It prints the core bindings (`enter`/`tab`/`@`/`/`/`ctrl+t`/`ctrl+o`/`shift+↑↓`/`esc`/`ctrl+d`) as `key description` pairs (accent key, muted description, ` · ` separators) greedily wrapped to the width. The moment a turn starts the component renders nothing and the inline renderer reclaims the lines. There is no bottom-anchoring: the editor stays inline (pi-tui's model), so on an empty screen the hints + editor sit at the top and the rest is ordinary scrollback.

## Overlays

Two overlays:

- **Session picker** (`/resume`): a full-width band (`width: "100%"`, `maxHeight: "60%"`) drawn over the column via pi-tui's overlay layer. It captures input while open: `↑`/`↓` move focus, `Enter` selects, `Esc` dismisses, printable chars extend the query filter, backspace shortens it. Driven by the `sessionPicker*` state slice (`tui-state.md`); selecting resumes the session through `platform.execute({name:"resumeSession"})` and switches to the resumed team.
- **Editor autocomplete popup** (slash commands, `@`-mentions): drawn by the pi-tui editor itself, anchored to the cursor; see `tui-shortcuts.md`.

## Editor

The editor is pi-tui's `Editor` subclass (`components/editor/jie-editor.ts`), full width, focused at startup. Top + bottom borders in `borderMuted`; when the buffer parses as a bash command (`!cmd` / `!!cmd`), both borders flip to `warning` color for the duration. Grows by one row per typed `\n`; never reserves a static row budget. Key handling is pi's verbatim plus three jie keys (`tui-shortcuts.md`). The editor's target is `state.focusedAgentId` (fallback: `state.leaderAgentId`); `onChange` syncs `state.editorText` and clears banners on the first keystroke after an error; `onSubmit` appends to prompt history and dispatches `submitEditorText`.

## Footer (2 lines)

Always two lines, full width. Line 1 is identity; line 2 is state + model. No shortcuts are hosted here.

### Line 1 — identity strip

```
left: CWD (branch[*dirty])            right: teamId:focusedAgentKey
```

- **Left**: `cwd (branch)`, e.g. `~/workspace/jie (main)`, in `accent`. CWD and git snapshot come from the CLI at startup (`TuiDeps.gitBranch`/`gitDirty`, read via jie-platform's `createGitService`); a `*` is appended when the working tree is dirty. Falls back to `(main)` when no branch is known. Does not change mid-session.
- **Right**: `<teamId or "no-team">:<focusedAgentKey or "—">`, in `muted`. Updates on team switch and on agent focus change.

### Line 2 — state + model

```
left: "0%/200k"  [queue]     right: "(<provider>) <modelId> | <effort>"
```

- **Stats** (left): context usage for the focused agent, e.g. `12%/200k`, colored `muted` → `warning` at 70% → `error` at 90%. Sourced from `agent.usage` events (`contextTokensUsed` per `tui-state.md`); `—` when no agent or model is focused.
- **Queue** (conditional): `N prompt(s) queued` + next-prompt preview when the focused agent's queue is non-empty, in `warning`. Absent otherwise. See `tui-state.md` "agent.prompt.queue.update".
- **Right**: the focused agent's `(provider) modelId | effort`, `muted` with the model id in `accent`; `—` when no agent is focused. Cycling focus swaps this segment.

## Borders

- Editor top + bottom borders: `─` × `cols`, color `borderMuted` (warning color in bash mode).
- The picker band draws its own frame via pi-tui's overlay layer.
