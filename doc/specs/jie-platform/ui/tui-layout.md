# TUI Layout (v0.2)

The v0.2 prototype's spatial design. Sibling of `tui-shortcuts.md` (keybindings)
and `tui-pi-reference.md` (theme tokens). The parent spec is `tui.md`; this
doc captures only the layout decisions made in the prototype and not yet
pinned at the parent level.

Example:
```text
> Tell me a story
thinking...                                                               
Marry had a little lamb.                                                        
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
⠋ Working…                                                                      
────────────────────────────────────────────────────────────────────────────────
<random tip for shortcuts>                                                                
────────────────────────────────────────────────────────────────────────────────
~/workspace/jie (main)                                           my-team:agent-1       
0%/200k  ←← for agents                                (anthropic) opus-4.8 | max
```

## Bottom strip

The TUI is a single column split into **four horizontal bands**, top to bottom:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  chat (and, when visible, left rail)                                       │  ← body
├────────────────────────────────────────────────────────────────────────────┤  ← border
│  editor                                                                     │  ← editor
├────────────────────────────────────────────────────────────────────────────┤  ← border
│  footer line 1                                                              │
│  footer line 2                                                              │  ← footer (2 lines)
└────────────────────────────────────────────────────────────────────────────┘
```

The `body` is whatever height remains after the editor and footer render
themselves; it is computed at render time, not stored. The two borders
between the bands are full-width `─` in `borderMuted` (240). All bands share
the terminal's full width — the editor spans the full row, including under
the rail.

- Reference terminal: **80 cols × 30 rows**.
- Editor height = `max(5, floor(terminalRows * 0.3)) + 2` border lines (9
  lines on a 30-row terminal).
- Body height = `terminalRows - editorLines - 2 borders - 2 footer lines`.

The body never hosts a status bar. The leader's status, queue depth, and
prompt-queue pickup are surfaced either in the rail (when visible) or in
the footer. See `tui.md` for the older status-bar design (superseded by
this layout for v0.2).

## Chat and rail

The body is split **horizontally, optionally**:

- Rail hidden (default): body is a single full-width chat pane.
- Rail visible: body is `rail | chat` with a `│` separator in `borderMuted`.

**Rail width** is `railWidth(cols)`:

- `cols < 80` → `floor(cols * 0.25)`, clamped to a minimum of 12.
- `cols >= 80` → 15..24 columns, fixed (responsive only on the small-terminal
  side; wide terminals get a fixed rail).

**Rail contents** are vertically centered, one row per agent, leader pinned
to top with `★`:

```
★ general
  coder
  reviewer
```

Each row carries a status glyph in the second column: `·` (idle), braille
spinner frames (busy), `✗` (err). The third column shows the agent's
`role`. See `tui-pi-reference.md` for color tokens.

**Chat pane** shows the focused agent's history + current turn. Each turn
is rendered top-to-bottom:

1. **User prompt** — first line is prefixed with `› ` in `userMessageIcon`
   color (cyan); continuation lines are indented 2 columns. The prompt
   is rendered **verbatim** (no markdown interpretation) — user-typed
   backticks, code fences, etc. show as literal text. Multi-line prompts
   are preserved as separate rendered lines. No background tint, no box.
2. **Assistant text block** — first line is prefixed with `● ` in
   `assistantMessageIcon` color (accent); continuation lines are indented
   2 columns. The body is rendered through `Markdown(...)` so headings,
   bold/italic, lists, code spans, code blocks, quotes, and links all
   style correctly. See the mock `markdown` reply for a working sample.
3. **Thinking block** (one or many). Collapsed renders as a single italic
   line `Thinking...` in `thinkingText` (no glyph, no spinner, no border).
   Expanded renders the body's `Markdown(...)` with `paddingX=1`,
   `paddingY=0`, and the default-text style override recoloring every
   glyph to `thinkingText` + italic — **no header line**. Matches pi's
   `AssistantMessageComponent` exactly. `Ctrl+T` expands / collapses all.
   See `tui-pi-reference.md` for the source.
4. **Tool cards** (`tool-call` + matching `tool-result`), one header line
   each when collapsed. `Ctrl+O` expands / collapses all.
5. **Working indicator**. While the focused agent's status is `busy`
   (any phase — pre-stream, thinking, streaming text, awaiting tool
   result, post-tool): a `● Working…` indicator sits at the bottom row
   of the chat pane, replacing whatever would otherwise be there. The
   indicator is gone the moment the agent transitions back to `idle`.
   The spinner frame advances with `Date.now()` so the animation
   continues even when the focused agent changes — switching back to a
   busy agent shows the live indicator, not a frozen one.

Between every two turns (history → history, history → current,
current → next history on submit), the renderer inserts **one blank
line**. This is the only party-spacing mechanism — the icons alone are
small, and the blank row gives the eye a clear break between user and
assistant messages. Within a turn, the order is: user prompt → tool
cards (if any) → thinking/text blocks.

The chat pane scrolls only when content exceeds its height — the reference
30-row layout does not show a scrollbar on the first turn.

## Editor

A `pi-tui` `Editor` instance, full width. Single-line by default; multi-line
when the prompt contains `\n`. Two borders (top + bottom) in `borderMuted`.
Placeholder: `type a prompt...` when empty.

Submit (`Enter`) appends to the editor's prompt history and dispatches a
prompt event to the reducer. `↑` / `↓` (with a non-empty history) walks
back / forward through previously submitted prompts — the editor owns this
behavior; the global input listener does not intercept plain arrow keys.

**The editor is connected to the focused agent, not a fixed leader.** On
submit, `editor.onSubmit` reads `state.focusedAgentKey` from the current
reducer state and includes it in the prompt envelope. Cycling agents with
`Ctrl+↑/↓` re-targets the editor without a refocus — the next `Enter` goes
to the currently focused agent. When `focusedAgentKey` is null (mid team
switch, before leader focus), submit falls back to the leader's key so the
prompt is not lost.

## Footer (2 lines)

The footer is **always two lines**, full width, both in `muted` (244). Line 1
is the identity strip; line 2 is the state + keymap + model strip. They are
not user-editable and never host shortcuts.

### Line 1 — identity strip

```
left: CWD (branch)            right: teamId:focusedAgentKey
```

- **Left**: `cwd (branch)`, e.g. `~/workspace/jie (main)`. CWD is taken
  from `process.cwd()` at TUI startup; branch is detected via
  `git -C <cwd> rev-parse --abbrev-ref HEAD`. Rendered in `accent` (109).
  Falls back to `(main)` when not in a git repo or git is unavailable.
  Does not change mid-session.
- **Right**: `teamId:focusedAgentKey`, e.g. `t1:general-1`. Rendered in
  `muted` (244). Updates on team switch (`teamLoaded`) and on agent focus
  change (`ui.agent.cycle`).

When nothing is loaded: left is unchanged, right becomes `no-team:—`. When
no focused agent (e.g. mid team-switch before leader focus): `no-team:—`.

Queue depth is **not** on this line. See line 2 / rail for queue surfacing.

### Line 2 — state + keymap + model

Three segments, joined by 2-space gaps:

```
left:   "0%/200k" (stats)     hint     right: "(<provider>) <modelId> | <effort>"
```

- **Stats** (left): usage indicator, in `muted`. v0.2 placeholder is
  `0%/200k` (static). The real implementation pulls from a session-stats
  event when it exists.
- **Hint** (left): a single short string describing the most useful
  rail-state-dependent shortcut. In `muted`. Two values:
  - hidden: `ctrl+left for agents`
  - visible: `ctrl+↑↓ switch agent  ctrl+left close agents`

  See `tui-shortcuts.md` for the full keymap — this hint is a one-line
  reminder, not the keymap.
- **Right**: the focused agent's `(provider) modelId | effort`, in
  `muted` with the model id itself in `accent`. When no focused agent: `—`.
  Each agent in a team has its own model; cycling focus with `Ctrl+↑/↓`
  swaps this segment to reflect the new focused agent's `(provider, id, effort)`.

### What line 1 is NOT

Line 1 does not host shortcuts. The footer hint lives on line 2. This is a
deliberate split: line 1 is **identity** (who am I, who am I talking to);
line 2 is **state + how to act** (token budget, current shortcut, model).
Mixing them crowds both. See ADR 25 for the rationale (footer is a mirror
of pi's, with the CWD/team split to make "where am I running" + "what's
loaded" scannable at a glance).

## Per-agent streaming isolation

See `tui-state.md` "Per-agent streaming isolation". The renderer reads only the focused agent's history + current turn; cycling focus is a view change that does not cancel another agent's stream.

## Rail styling

The rail's three tokens are jie-specific decisions layered on pi's color palette (per `tui-pi-reference.md`):

- Leader marker (`★`): `accent` color.
- Agent name: `text` color.
- Idle status icon (`·`): `muted` color; busy (`⠋`–`⠏` braille spinner): `accent`; error (`✗`): `error` red.

These mappings live here (not in `tui-pi-reference.md`) because they are jie-specific decisions, not pi's tokens.

## Borders and separators

- Editor top + bottom borders: `─` × `cols`, color `borderMuted` (240).
- Rail / chat separator (when rail visible): `│` at column `railWidth`,
  color `borderMuted`.
- All borders share the same token so the eye reads them as one
  "container".

## What is intentionally out of scope for v0.2

- Status bar (top of screen) — superseded by footer line 2 + rail.
- Multi-pane chat (split-view when multiple agents are mid-stream) —
  out; the user can cycle with `Ctrl+↑/↓` to inspect other agents.
- Floating tool overlays / modal prompts — out; the editor is the only
  input surface.