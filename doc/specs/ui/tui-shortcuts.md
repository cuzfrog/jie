# TUI Keybinding Matrix

The TUI is keyboard-driven. All keybindings are global (handled by the input listener, not the focused widget) unless noted. Some keys are conditional on the rail being visible or an agent being busy. All bindings are implemented in `components/global-keys.tsx` (global) and the editor component (editor-local keys).

## Global

| Key            | What it does                                                  | Active when                                |
| -------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `Enter`        | Submit the editor buffer as a prompt                          | editor focused (always)                    |
| `↑`            | Recall the previous prompt into the editor                    | editor focused, history non-empty          |
| `↓`            | Recall the next prompt into the editor                        | editor focused, currently walking history  |
| `Esc`          | Interrupt the current agent run (abort the in-flight stream) | focused agent is `busy`                    |
| `Shift+←`      | Toggle the left rail (agents panel) on / off                 | always                                     |
| `Ctrl+T`       | Expand / collapse all thinking blocks in this agent's history | focused agent has at least one thinking block |
| `Ctrl+O`       | Expand / collapse all tool cards in this agent's history      | focused agent has at least one tool card   |
| `Ctrl+C`       | Clear the editor if non-empty; otherwise quit the TUI         | editor focused (closes the session picker while it is open) |
| `Ctrl+D` (twice, within 500 ms) | Quit the TUI                                   | always (closes the session picker while it is open, arming the quit window) |
| `PgUp` / `PgDn` | Scroll the chat viewport up / down by one page minus one row | always (chat pane)                        |
| `Home` / `End` | Jump the chat viewport to the top / re-pin it to the tail     | always (chat pane)                         |
| mouse wheel    | Scroll the chat viewport (3 rows per notch)                   | terminal reports SGR mouse events          |

Chat scroll position is per-agent memory in `state.chatScrollOffsets` (`tui-state.md`); switching agents restores each agent's own offset. A viewport that reaches the bottom re-pins to the tail so new output pushes it down again.

## Rail-visible only

When `state.showTeamRailPanel === true`:

| Key            | What it does                              | Active when                              |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| `Shift+↑` or `Ctrl+↑` | Focus the previous agent in the rail      | rail visible, more than one agent        |
| `Shift+↓` or `Ctrl+↓` | Focus the next agent in the rail          | rail visible, more than one agent        |

## Esc vs Ctrl+C

`Esc` interrupts the focused agent only while that agent is busy; it does not clear the editor or quit. `Ctrl+C` clears the editor buffer when non-empty; on an empty buffer it quits the TUI. The split avoids losing a half-typed prompt to an interrupt key.

## Ctrl+D×2 to quit

A single `Ctrl+D` is a no-op; two presses within 500 ms quit the TUI. Deliberate alternative to `Ctrl+C` for users who prefer `Ctrl+D` as their muscle-memory quit (matches pi's `Ctrl+D` exit).

While the session picker is open, global keys are suppressed except `Ctrl+C` and `Ctrl+D`: `Ctrl+C` closes the picker; `Ctrl+D` closes it **and** arms the quit window, so a quick double-tap closes the picker and quits. `Esc` also closes the picker.

## Ctrl+T and Ctrl+O

Both toggles are all-or-nothing across the focused agent's history + current turn: `Actions.toggleThinking()` flips `state.thinkingExpanded` and `Actions.toggleToolCards()` flips `state.toolCardsExpanded`; `MessageView` and `ToolCard` read those flags. `Ctrl+T` does not affect tool cards and `Ctrl+O` does not affect thinking blocks. Mid-stream toggle works: the most recent block re-renders in its new state on the next render tick.

## Prompt history

`↑` / `↓` in the editor walk the prompt history (most-recent first). Owned by the editor component (`components/editor/editor.tsx`), which keeps `history`/`historyIndex`/`draft` component-local and prepends each submitted prompt. `Shift+↑` / `Shift+↓` and `Ctrl+↑` / `Ctrl+↓` are rail-cycling keys and bypass the editor; the plain-arrow form is not intercepted by the global input listener, so the editor handles it natively.

## Slash commands

Slash commands are typed at the editor prompt (no key chord). Each starts with `/`; the editor treats the line as a command rather than a prompt and dispatches synchronously without publishing to the bus.

Typing `/` opens the **slash autocomplete** panel above the footer: it filters commands by the token after `/`, `Tab` commits the focused entry (submitting the command line immediately, arguments included), `Shift+Tab` cycles focus, and the panel clamps its entries to the rows the terminal can spare (hiding entirely on very short terminals). Outside slash commands, typing `@` opens the analogous **file mention** panel over gitignore-aware project files; `Tab` there replaces the `@query` token with the picked path.

| Command | Effect | Transient message |
|---|---|---|
| `/login <provider> <apiKey>` | Write a single API key entry to `~/.jie/auth.json` (mode `0600`); no interactive provider selection | `logged in to <provider>` |
| `/logout [<provider>]` | Clear one or all entries from `~/.jie/auth.json` | `logged out of <provider>` (or `logged out of all providers`) |
| `/model <provider>/<modelId>` | Validate and write to `~/.jie/settings.json` | `default model set to <provider>/<modelId>` |
| `/team <id>` | If installed, switch the TUI's active team (`execute({name:"team"})` then `Actions.switchTeam`). If not installed, error banner; no team switch | `loading team '<id>'` |
| `/team` (no arg) | Show `defaultTeam` and installed team IDs | `defaultTeam: <id or unset> \| installed: <ids>` |
| `/resume` | List the team's stored sessions (`listSessions`) and open the session picker: `↑`/`↓` move, typing filters, `Enter` resumes the selected session (`resumeSession` + team switch), `Esc`/`Ctrl+C` cancel | none |
| `/continue` | Alias for `/resume` | none |
| `/clear` | Clear `state.agents`, `leaderAgentId`, `focusedAgentId`, `transientMessage`, `errorBanner`. Memory rows on disk untouched | none |
| `/help` | Open an overlay rendering the keymap from this doc | none |
| `/exit` | Same as `Ctrl+D` (twice within 500 ms). No busy-state branch | none |

## Conflict-resolution rationale

Three layers compete for keys: the OS shell / desktop, the TTY driver (or conhost), and the TUI. The TUI runs with stdin in raw mode (owned by `@cuzfrog/jie-ink`), so TTY specials (`Ctrl+C` intr, `Ctrl+D` eof, `Ctrl+O` discard, `Ctrl+T` transpose) arrive as plain bytes and are safe to bind — but only under that contract. Any non-raw input path (e.g. a `jie -p`-style line editor) must keep standard TTY semantics: there `Ctrl+C` is SIGINT, not a free binding.

Bindings the TUI deliberately avoids:

- Window / app lifecycle: `Cmd+Q`, `Cmd+W`, `Alt+F4`, `Win+*`, `Ctrl+Esc`, `F12` (debugger-reserved). Quit is `/exit`, `Ctrl+D`×2, or `Ctrl+C` on an empty editor.
- Clipboard / edit menu: `Cmd+C/V/X/A` and Linux `Ctrl+Shift+C/V` — owned by the terminal emulator. The TUI attempts no uniform text-operations palette.
- OS system shortcuts: `Cmd+Space`, `Cmd+Tab`, `Opt+Cmd+Esc`, `Alt+Tab`, `Win+L/R/E/D/Tab`.

Bindings the TUI intentionally mirrors:

- Plain `↑` / `↓` prompt-history walking (readline, cmd/PowerShell convention).
- `Enter` to submit, `Backspace` to erase, `Tab` to complete — universal terminal conventions.
- `Ctrl+D` as quit muscle memory (matches pi). It is honored only as a double-tap within 500 ms to avoid the cooked-mode EOF implication.
- A single `Esc` interrupts the focused busy agent.

`Shift+←` was chosen for the rail toggle because `Ctrl+←` / `Ctrl+→` are word-jump in the Windows console host and in many terminal / readline setups; shift-arrow chords are unclaimed. `Ctrl+T` and `Ctrl+O` are honored despite their cooked-mode claims (transpose / discard) because those are inactive under the raw-mode contract.
