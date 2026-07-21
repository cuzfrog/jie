# TUI Layout (v0.2)

The v0.2 prototype's spatial design. Sibling of `tui-shortcuts.md` (keybindings), `tui-state.md` (data model), and `tui-pi-reference.md` (theme tokens). The parent doc is `tui-overview.md`; this doc captures the layout decisions.

Example:
```text
> Tell me a story
thinking...
Marry had a little lamb.
...
⠋ Working…
────────────────────────────────────────────────────────────────────────────────
 hello world
────────────────────────────────────────────────────────────────────────────────
~/workspace/jie (main)                                           my-team:agent-1
0%/200k  shift&← show agents                           (anthropic) opus-4.8 | max
```

## Bottom strip

The TUI is a single column split into **three horizontal bands**, top to bottom: body, editor, footer.

The body is whatever height remains after the editor and footer render themselves. It is not stored; it is recomputed per render via `flexGrow={1}` on the body box. Bands share the terminal's full width — the editor spans the full row, including under the rail.

- Reference terminal: **80 cols × 30 rows**.
- Editor height: **1 content row + 2 border rows (top + bottom) by default** — the box is a single thin strip. The content row count grows by one for every `\n` the user types.
- Footer height is fixed at 2 rows.

The body never hosts a status bar. The leader's status, queue depth, and prompt-queue pickup are surfaced either in the rail (when visible) or in the footer.

## Chat and rail

The body is split **horizontally, optionally**:

- Rail hidden (default): body is a single full-width chat pane.
- Rail visible: body is `rail | chat` with a `│` separator in `borderMuted`.

**Rail width** is `railWidth(cols)` (`components/themes.ts`) — always `floor(cols * 0.25)`, responsively:

- `cols < 80` → clamped to a minimum of 12.
- `cols >= 80` → clamped to `[15, 24]`.

**Rail contents** are vertically centered, one row per agent, leader pinned to top with `★`:

```
★ general
  coder
  reviewer
```

Each row carries a status glyph in the second column: `·` (idle), braille spinner frames (busy), `✗` (err). The third column shows the agent's `role`. See `tui-pi-reference.md` for color tokens.

**Chat pane** shows the focused agent's history + current turn. Each turn is rendered top-to-bottom:

1. **User prompt** — first line is prefixed with `› ` in `userMessageIcon` color (cyan); continuation lines are indented 2 columns. The prompt is rendered **verbatim** (no markdown interpretation) — user-typed backticks, code fences, etc. show as literal text. Multi-line prompts are preserved as separate rendered lines. No background tint, no box.
2. **Assistant text block** — first line is prefixed with `● ` in `assistantMessageIcon` color (accent); continuation lines are indented 2 columns. The body is rendered through `Markdown(...)` so headings, bold/italic, lists, code spans, code blocks, quotes, and links all style correctly. See the mock `markdown` reply for a working sample.
3. **Thinking block** (one or many). Collapsed renders as a single italic line `Thinking...` in `thinkingText` (no glyph, no spinner, no border). Expanded renders the body's `Markdown(...)` with `paddingX=1`, `paddingY=0`, and the default-text style override recoloring every glyph to `thinkingText` + italic — **no header line**. Matches pi's `AssistantMessageComponent` exactly. `Ctrl+T` expands / collapses all. See `tui-pi-reference.md` for the source.
4. **Tool cards** (`tool-call` + matching `tool-result`), one header line each when collapsed. `Ctrl+O` expands / collapses all.
5. **Working indicator**. While the focused agent's status is `busy` (any phase — pre-stream, thinking, streaming text, awaiting tool result, post-tool): a `● Working…` indicator sits at the bottom row of the chat pane, replacing whatever would otherwise be there. The indicator is gone the moment the agent transitions back to `idle`. The spinner frame advances with `Date.now()` so the animation continues even when the focused agent changes — switching back to a busy agent shows the live indicator, not a frozen one.

Between every two turns (history → history, history → current, current → next history on submit), the renderer inserts **one blank line**. This is the only party-spacing mechanism — the icons alone are small, and the blank row gives the eye a clear break between user and assistant messages. Within a turn, the order is: user prompt → tool cards (if any) → thinking/text blocks.

The chat pane scrolls only when content exceeds its height — the reference 30-row layout does not show a scrollbar on the first turn.

## Editor

The editor is a single React component that owns its input loop and prompt history. It is full width, drawn between the body and the footer.

- **Single-line by default; grows by one row for every `\n` typed** — the editor never reserves a static fraction of rows.
- **Borders**: top + bottom only in `borderMuted`; left and right are open (no `│`).
- **Cursor**: an ANSI inverse-space block rendered inline as part of the editor's text. When the buffer is empty, the row shows only the block. When the buffer has text, the block sits at the cursor's `(cursorLine, cursorCol)` position — it can be in the middle of a line, or at the end of a line as an inverse space (e.g. `ab44ds`+`\u001b[7m \u001b[27m`). Multi-line buffers render the block only on the cursor's line. The block travels with the text by construction, so Ink's `useCursor()` placement is intentionally not used (it inherits a `buildReturnToBottom` off-by-one in fullscreen mode that misaligns the OS cursor when the trailing line contains trailing whitespace — see ADR 27 for the original `useCursor()` design and the rationale for dropping it). The Editor's own input handling implements multi-line cursor positioning per `tui-pi-editor-reference.md` §9.
- **Padding**: 1 column on the left and right inside the border.
- **Bash mode strip**: when the buffer parses as a bash command (`!cmd`, or `!!cmd` for the context-excluding variant), one `warning`-colored row sits directly above the editor's top border announcing the mode and whether the command and its output stay in context. The row is absent otherwise; its row goes back to the chat pane (the picker row budget accounts for it like the transient banner's).

The editor is connected to the focused agent, not a fixed leader. On submit (`Enter`), the command handler reads `state.focusedAgentId` from the current reducer state and addresses the prompt envelope to that agent's key. Cycling agents with `Shift+↑/↓` or `Ctrl+↑/↓` re-targets the editor without a refocus — the next `Enter` goes to the currently focused agent. When `focusedAgentId` is null (mid team switch, before leader focus), submit falls back to the leader's key so the prompt is not lost.

`↑` / `↓` (with a non-empty history) walks back / forward through previously submitted prompts — the editor owns this behavior; the global input listener does not intercept plain arrow keys.

## Footer (2 lines)

The footer is **always two lines**, full width, both in `muted`. Line 1 is the identity strip; line 2 is the state + keymap + model strip. They are not user-editable and never host shortcuts.

### Line 1 — identity strip

```
left: CWD (branch)            right: teamId:focusedAgentKey
```

- **Left**: `cwd (branch)`, e.g. `~/workspace/jie (main)`. CWD is taken from `process.cwd()` at TUI startup; branch is detected via `git -C <cwd> rev-parse --abbrev-ref HEAD`, and a `*` is appended when the working tree is dirty (`~/workspace/jie (main*)`). Rendered in `accent`. Falls back to `(main)` when not in a git repo or git is unavailable. Does not change mid-session.
- **Right**: `<teamId or "no-team">:<focusedAgentKey or "—">`, e.g. `t1:general-1`. Rendered in `muted`. Updates on team switch (`teamLoaded`) and on agent focus change (`ui.agent.cycle`).

When no team is loaded: left is unchanged, right reads `no-team:—`. When a team is loaded but no agent is focused (e.g. mid team-switch before leader focus): `<teamId>:—`.

Queue depth is **not** on this line. See line 2 / rail for queue surfacing.

### Line 2 — state + keymap + model

Three segments plus a conditional queue segment:

```
left:   "0%/200k" (stats)     hint          [queue]     right: "(<provider>) <modelId> | <effort>"
```

- **Stats** (left): context usage for the focused agent, e.g. `12%/200k`, colored `muted` → `warning` at 70% → `error` at 90%. Sourced from `agent.usage` events (`contextTokensUsed` / `lastReportedTotalTokens` per `tui-state.md`); when no usage has been reported yet, a token estimate over the rendered conversation stands in. Reads `—` when no agent or model is focused.
- **Hint** (left): a single short string describing the most useful rail-state-dependent shortcut. In `muted`. Two values:
  - hidden: `shift&← show agents`
  - visible: `shift&↑↓ switch agent  shift&← close agents`

  See `tui-shortcuts.md` for the full keymap — this hint is a one-line reminder, not the keymap.
- **Queue** (right of hint, conditional): `N prompt(s) queued` + next-prompt preview when the focused agent's queue is non-empty, in `warning` color. Absent otherwise. See `tui-state.md` "agent.prompt.queue.update".
- **Right**: the focused agent's `(provider) modelId | effort`, in `muted` with the model id itself in `accent`. When no focused agent: `—`. Each agent in a team has its own model; cycling focus with `Shift+↑/↓` or `Ctrl+↑/↓` swaps this segment to reflect the new focused agent's `(provider, id, effort)`.

### What line 1 is NOT

Line 1 does not host shortcuts. The footer hint lives on line 2. This is a deliberate split: line 1 is **identity** (who am I, who am I talking to); line 2 is **state + how to act** (token budget, current shortcut, model). Mixing them crowds both. See ADR 25 for the rationale (footer is a mirror of pi's, with the CWD/team split to make "where am I running" + "what's loaded" scannable at a glance).

## Rail styling

The rail's three tokens are jie-specific decisions layered on pi's color palette (per `tui-pi-reference.md`):

- Leader marker (`★`): `accent` color.
- Agent name: `text` color.
- Idle status icon (`·`): `muted` color; busy (`⠋`–`⠏` braille spinner): `accent`; error (`✗`): `error` red.

These mappings live here (not in `tui-pi-reference.md`) because they are jie-specific decisions, not pi's tokens.

## Borders and separators

- Editor top + bottom borders: `─` × `cols`, color `borderMuted`.
- Rail / chat separator (when rail visible): `│` at column `railWidth`, color `borderMuted`.
- All borders share the same token so the eye reads them as one "container".
