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
   █▀▀▀▀█▀▀▀▀█     jie  multi-agent coding, right in your terminal
   █▄▄▄▄█▄▄▄▄█     界 (jiè) · boundary; world
   █▀▀▀▀█▀▀▀▀█     team my-team · general-1 (leader) · qa-1 · openai/gpt-4o
   ▀▀▀▀▀█▀▀▀▀▀
      ▄██▀█▄
    ▄▀▄▀ █ ▀▄
  ▄▀ ▄▀  █   ▀▄

Commands
  /help  show this help
  /clear  clear the conversation
  …
  /resume <sessionId>  resume a session of the loaded team
  /rename <name>  name the active session

Shortcuts
enter send · tab complete · @ mention a file · / commands · ctrl+t thinking
ctrl+o tool output · ctrl+↓ team panel · esc interrupt · ctrl+d quit
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────
~/workspace/jie (main)                                           my-team:general-1
```

## Single inline column

The TUI renders a column of stacked sections, top to bottom: chat, todos, working indicator, status line, welcome splash (empty state), editor, footer, team strip (wired by `components/view.ts`). Every section spans the full terminal width; the team strip renders below the footer only while shown, borrowing rows from the bottom of the frame, never width from the chat (`tui-team-panel.md`). Rendering is **inline into the normal terminal buffer** (pi-tui; no alternate screen): finished conversation output scrolls away as ordinary terminal scrollback, and selection/copy is the terminal's own. There is no app-level scrollback buffer, no mouse/wheel handling. Agent visibility lives in the team strip (roster, status, queue) plus the footer (focused agent, per-agent model) and the cursor keys (`tui-shortcuts.md`).

Reference terminal: **80 cols**. Every section spans the full width; every custom component truncates each rendered line to the given width (pi-tui's `doRender` throws on over-wide lines — this is pinned by per-component fuzz tests).

## Chat

The chat section is append-only: `sync/chat-sync.ts` subscribes to the state store and performs **structural ops only** (append/shrink/clear child components, keyed by entry kind + `seq` — entry sequence in `tui-state.md`) — components pull their own slice from the store in `render(width)`, so streamed text updates in place. The focused agent's turns and info entries merge in `seq` order and render top-to-bottom; each turn is:

1. **User prompt** — prefixed with `› ` in `userMessageIcon` color (cyan); continuation lines indent 2 columns. Rendered **verbatim** (no markdown interpretation).
2. **Assistant text block** — prefixed with `● ` in `assistantMessageIcon` color (accent); continuation lines indent 2 columns. Rendered through pi-tui's `Markdown` with `jieMarkdownTheme()` (`themes.ts`): headings, bold/italic, lists, code spans, quotes, and links all style; fenced code blocks are syntax-highlighted per fence language (cli-highlight via the theme's `highlightCode` hook, every hljs token mapped to a palette color with raw ANSI so output is identical on TTY and buffer), and an unknown or absent language falls back to the plain `codeBlock` style. OSC-8 hyperlinks are gated on `INK_OSC8=1` (capabilities set at startup).
3. **Thinking block** (one or many) — collapsed renders a single italic `Thinking...` line in `thinkingText`; expanded renders the markdown body recolored to `thinkingText` + italic. `Ctrl+T` expands / collapses all (`state.thinkingExpanded`).
4. **Tool cards** (`tool-call` + matching `tool-result`) — one header line when collapsed (`✓`/`✗` glyph, name, duration); expanded shows input, output (the reducer unwraps `{content, details, terminate}` envelopes to the string content), and a diff view when the result carries one. `Ctrl+O` expands / collapses all (`state.toolCardsExpanded`).

**Info entries** interleave with turns in `seq` order (`tui-state.md`, entry sequence). The single kind today — the `/help` reprint — renders `welcomeLines` (`components/welcome-banner.ts`) — exactly the empty-state splash content: mark + identity lines, the Commands section, and the Shortcuts section with the keybinding hint lines. Every line truncates to the column width. The reprint is created once per `/help` and never mutates afterward.

The **todo list** renders as its own section below the chat (the focused agent's `agent.todos`, replaced wholesale when a todo-tool result arrives). The **working indicator** slot shows exactly one of three states: while **any** agent is `busy`, a pi-tui `Loader` (accent spinner + `Working…` label); else while `state.interruptedAgentId` is set — the focused agent's last idle was `aborted` (`tui-state.md`, `agent.idle`) — a static muted `Interrupted` line (the same `Loader` with empty spinner frames, no animation); else empty. The slot empties when the interrupted agent starts its next turn, when the user submits, on team switch, or on `/clear`.

The **status line** section sits between the working slot and the editor: the transient message row (`muted`, aged out after 5 s; a newer transient resets the timer) and the error banner row (`error`), each only when present.

The **welcome splash** section sits between the status line and the editor and renders only while the chat has no content — no agent has history or an in-progress turn and `state.infoEntries` is empty (the `hasChatContent` gate). At widths of at least 66 columns it draws the half-block `界` mark (accent) beside the identity block; narrower widths render the identity block alone. The identity block is the `jie` wordmark + tagline (accent wordmark, muted tagline), the `界 (jiè) · boundary; world` gloss (warning glyph, muted gloss), and, once a team is loaded, a team line: `team <id>` (accent) followed by the agent roster (agent key, `(leader)` mark, `provider/modelId` when a model is assigned, ` · ` separators). Below sit the **Commands** section — a plain text heading then every command from the shared `COMMAND_METADATA` registry (the same one that feeds the autocomplete hints): accent `/name`, warning argument hint, muted one-line description, in slash-command order, in two columns when the width fits both, otherwise one — and the **Shortcuts** section (a plain text heading + the keybinding hint lines, below). Headings carry no rule line. It disappears the moment a turn starts or `/help` reprints this content into the chat, so the reprint is never duplicated above the chat. On terminals shorter than splash + editor + footer (28 rows at 80 cols) the splash top becomes ordinary scrollback — inline rendering reserves no screen height.

The **keybinding hints** render under the **Shortcuts** heading of both the welcome splash and the `/help` reprint (identical content): `hintLines(width)` (`components/key-hints.ts`) lays out the core bindings (the `tui-shortcuts.md` matrix) as `key description` pairs (accent key, muted description, ` · ` separators), greedily wrapped to the width. There is no bottom-anchoring: the editor stays inline (pi-tui's model), so on an empty screen the splash + editor sit at the top and the rest is ordinary scrollback.

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

The editor is pi-tui's `Editor` subclass (`components/editor/jie-editor.ts`), full width, focused at startup. Its autocomplete provider is jie's (`autocomplete/jie-autocomplete.ts`): slash commands, `/team`, `/resume`, `/model`, and `/effort` argument completion ("Selection via editor autocomplete" above), and `@`-file mentions. Top + bottom borders in `borderMuted`; when the buffer parses as a bash command (`!cmd` / `!!cmd`), both borders flip to `warning` color for the duration. Grows by one row per typed `\n`; never reserves a static row budget. Key handling is pi's verbatim plus three jie keys (`tui-shortcuts.md`). While the autocomplete popup is open, the highlighted suggestion's tail renders as `dim` ghost text right after the cursor, tracking the popup selection (`Up`/`Down`); it appears only when the selected value extends the typed prefix, and consumes trailing padding so the row width is unchanged. The editor's target is `state.focusedAgentId` (fallback: `state.leaderAgentId`); `onChange` syncs `state.editorText` and clears banners on the first keystroke after an error; `onSubmit` appends to prompt history (persisted as one JSON line per entry in `<jie home>/prompt-history.jsonl`, seeded back into the `Up`/`Down` walk at the next startup) and dispatches `submitEditorText`.

## Footer (2 lines)

Full width. Two lines — line 1 identity, line 2 state + model — except while the team strip is shown (`tui-team-panel.md`): then line 2 is dropped, since the strip already carries the focused agent's context and model. No shortcuts are hosted here.

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
