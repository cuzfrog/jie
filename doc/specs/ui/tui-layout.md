# TUI Layout (v0.2)

The v0.2 prototype's spatial design. Sibling of `tui-shortcuts.md` (keybindings), `tui-state.md` (data model), and `tui-pi-reference.md` (theme tokens). The parent doc is `tui-overview.md`; this doc captures the layout decisions.

Example (conversation in flight):
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

Example (empty screen, team loaded):
```text
jie  multi-agent coding, right in your terminal
team my-team · general-1 (leader) · qa-1 · openai/gpt-4o
enter send · tab complete · @ mention a file · / commands · ctrl+t thinking · …
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────
~/workspace/jie (main)                                           my-team:general-1
```

## Single inline column

The TUI renders a single full-width column of stacked sections, top to bottom: chat, todos, working indicator, status line, welcome banner (empty state), keybinding hints (empty state), editor, footer (composed by `components/layout.ts`, wired by `components/view.ts`). Rendering is **inline into the normal terminal buffer** (pi-tui; no alternate screen): finished conversation output scrolls away as ordinary terminal scrollback, and selection/copy is the terminal's own. There is no rail, no app-level scrollback buffer, no mouse/wheel handling. Agent visibility that the rail used to provide lives in the footer (focused agent, per-agent model) plus the agent-cycle keys (`tui-shortcuts.md`).

Reference terminal: **80 cols**. Every section spans the full width; every custom component truncates each rendered line to the given width (pi-tui's `doRender` throws on over-wide lines — this is pinned by per-component fuzz tests).

## Chat

The chat section is append-only: `sync/chat-sync.ts` subscribes to the state store and performs **structural ops only** (append/shrink/clear child components, keyed by entry kind + `seq` — entry sequence in `tui-state.md`) — components pull their own slice from the store in `render(width)`, so streamed text updates in place. The focused agent's turns and info entries merge in `seq` order and render top-to-bottom; each turn is:

1. **User prompt** — prefixed with `› ` in `userMessageIcon` color (cyan); continuation lines indent 2 columns. Rendered **verbatim** (no markdown interpretation).
2. **Assistant text block** — prefixed with `● ` in `assistantMessageIcon` color (accent); continuation lines indent 2 columns. Rendered through pi-tui's `Markdown` with `jieMarkdownTheme()` (`themes.ts`): headings, bold/italic, lists, code spans, fenced code, quotes, and links all style. OSC-8 hyperlinks are gated on `INK_OSC8=1` (capabilities set at startup).
3. **Thinking block** (one or many) — collapsed renders a single italic `Thinking...` line in `thinkingText`; expanded renders the markdown body recolored to `thinkingText` + italic. `Ctrl+T` expands / collapses all (`state.thinkingExpanded`).
4. **Tool cards** (`tool-call` + matching `tool-result`) — one header line when collapsed (`✓`/`✗` glyph, name, duration); expanded shows input, output (the reducer unwraps `{content, details, terminate}` envelopes to the string content), and a diff view when the result carries one. `Ctrl+O` expands / collapses all (`state.toolCardsExpanded`).

**Info entries** interleave with turns in `seq` order (`tui-state.md`, entry sequence). The single kind today — the `/help` reprint — renders the welcome content (wordmark + tagline, the loaded team line), the keybinding hint lines, and a command cheat-sheet drawn from the shared command metadata (`COMMAND_METADATA` — the same registry that feeds the autocomplete hints; each row is accent `/name <hint>` + muted one-line description, in slash-command order). Every line truncates to the column width. The reprint is created once per `/help` and never mutates afterward.

The **todo list** renders as its own section below the chat (the focused agent's `agent.todos`, replaced wholesale when a todo-tool result arrives). The **working indicator** slot shows exactly one of three states: while **any** agent is `busy`, a pi-tui `Loader` (accent spinner + `Working…` label); else while `state.interruptedAgentId` is set — the focused agent's last idle was `aborted` (`tui-state.md`, `agent.idle`) — a static muted `Interrupted` line (the same `Loader` with empty spinner frames, no animation); else empty. The slot empties when the interrupted agent starts its next turn, when the user submits, on team switch, or on `/clear`.

The **status line** section sits between the working slot and the editor: the transient message row (`muted`, aged out after 5 s; a newer transient resets the timer) and the error banner row (`error`), each only when present.

The **welcome banner** section sits between the status line and the keybinding hints and renders only while the chat has no content — no agent has history or an in-progress turn and `state.infoEntries` is empty (the same `hasChatContent` gate as the hints). It prints the `jie` wordmark + tagline (accent wordmark, muted tagline) and, once a team is loaded, a team line: `team <id>` (accent) followed by the agent roster (agent key, `(leader)` mark, `provider/modelId` when a model is assigned, ` · ` separators). It disappears the moment a turn starts or `/help` reprints this content into the chat, so the reprint is never duplicated above the chat.

The **keybinding hints** section sits between the welcome banner and the editor and renders only while the chat has no content — the same `hasChatContent` gate as the banner (no agent has history or an in-progress turn, and `state.infoEntries` is empty). It prints the core bindings (`enter`/`tab`/`@`/`/`/`ctrl+t`/`ctrl+o`/`shift+↑↓`/`esc`/`ctrl+d`) as `key description` pairs (accent key, muted description, ` · ` separators) greedily wrapped to the width. The moment a turn starts the component renders nothing and the inline renderer reclaims the lines. There is no bottom-anchoring: the editor stays inline (pi-tui's model), so on an empty screen the banner + hints + editor sit at the top and the rest is ordinary scrollback.

## Selection via editor autocomplete

Team switch and session resume are selected through the editor's own autocomplete popup — there is no separate menu surface, and the editor never leaves the layout. The jie autocomplete provider (`autocomplete/jie-autocomplete.ts`) attaches argument completions to five slash commands. Every command row in the popup shows the argument hint and one-line description as right-aligned ghost text (`<hint> — <description>`, description alone when hint-less), both taken from the shared command metadata (`COMMAND_METADATA`) that also feeds the `/help` cheat-sheet:

- **`/team `** — installed team ids from `getTeamInfo`, the default marked `(default)`.
- **`/resume `** — the loaded team's sessions from `listSessions`, each described as `<n> msg · <age>` (a relative age: now/m/h/d/mo/y); a session named via `/rename` shows that name as its label instead of the session id.
- **`/model `** — the registry's models from `listModels` as `<provider>/<modelId>`, each described by the model's human-readable name.
- **`/login `** — provider ids from `listProviders` (models.json providers first, then built-ins, deduped), each described by the env var name providing its key, or `configured` for a models.json provider.
- **`/effort `** — the five effort levels (`off`/`low`/`medium`/`high`/`max`).

**Unambiguous drill-down.** When the typed `/`-token fuzzy-matches exactly one command that has argument completions (e.g. `/resum`), the popup lists that command's argument rows directly — labeled `resume <id>`, `team <id>`, etc., with the same descriptions as the space-triggered list — without waiting for the space after the command name. Committing such a row types `/command <arg> ` (trailing space, ready to submit). Multiple matches (e.g. `/re` → `resume`/`rename`), commands without arguments, or an empty argument list fall back to the plain command-name candidates.

The popup is drawn by the pi-tui editor inside its own frame, anchored below the input line; the chat stays fully visible above and the editor's `─` borders stay on screen. `Tab` or `Enter` commits the highlighted argument into the buffer; once the typed argument exactly matches an entry the popup closes on its own and a single `Enter` submits. Submitting runs the command handler: `/team <id>` loads the team, `/resume <sessionId>` resumes the session, `/model <provider>/<modelId>` sets the default model (`tui-shortcuts.md`, "Slash commands"). `Esc` dismisses the popup and keeps the buffer text.

## Editor

The editor is pi-tui's `Editor` subclass (`components/editor/jie-editor.ts`), full width, focused at startup. Its autocomplete provider is jie's (`autocomplete/jie-autocomplete.ts`): slash commands, `/team`, `/resume`, `/model`, and `/effort` argument completion ("Selection via editor autocomplete" above), and `@`-file mentions. Top + bottom borders in `borderMuted`; when the buffer parses as a bash command (`!cmd` / `!!cmd`), both borders flip to `warning` color for the duration. Grows by one row per typed `\n`; never reserves a static row budget. Key handling is pi's verbatim plus three jie keys (`tui-shortcuts.md`). The editor's target is `state.focusedAgentId` (fallback: `state.leaderAgentId`); `onChange` syncs `state.editorText` and clears banners on the first keystroke after an error; `onSubmit` appends to prompt history (persisted as one JSON line per entry in `<jie home>/prompt-history.jsonl`, seeded back into the `Up`/`Down` walk at the next startup) and dispatches `submitEditorText`.

## Footer (2 lines)

Always two lines, full width. Line 1 is identity; line 2 is state + model. No shortcuts are hosted here.

### Line 1 — identity strip

```
left: CWD (branch[*dirty])            right: teamId:focusedAgentKey
```

- **Left**: `cwd (branch)`, e.g. `~/workspace/jie (main)`, in `accent`. CWD and git snapshot come from the CLI at startup (`TuiDeps.gitBranch`/`gitDirty`, read by the CLI from the platform container's `gitService`); a `*` is appended when the working tree is dirty. Falls back to `(main)` when no branch is known. Does not change mid-session.
- **Right**: `<teamId or "no-team">:<focusedAgentKey or "—">`, in `muted`. Updates on team switch and on agent focus change.

### Line 2 — state + model

```
left: "0%/200k"  [queue]     right: "(<provider>) <modelId> | <effort>"
```

- **Stats** (left): context usage for the focused agent, e.g. `12%/200k`, colored `muted` → `warning` at 70% → `error` at 90%. Sourced from `agent.usage` events (`contextTokensUsed` per `tui-state.md`); `—` when no agent or model is focused.
- **Queue** (conditional): `N prompt(s) queued` + next-prompt preview when the focused agent's queue is non-empty, in `warning`. Absent otherwise. See `tui-state.md` "agent.prompt.queue.update".
- **Right**: the focused agent's `(provider) modelId | effort`, `muted` with the model id in `accent`; `—` when no agent is focused. Cycling focus swaps this segment. It reflects the focused agent's *running* model: `/model` sets the default for teams loaded thereafter and does not hot-swap a running agent, so this segment updates at the next team load.

## Borders

- Editor top + bottom borders: `─` × `cols`, color `borderMuted` (warning color in bash mode). The autocomplete popup renders inside the editor's frame, so the borders stay present while it is open.
