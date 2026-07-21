# TUI Keybinding Matrix

The TUI is keyboard-driven. Editor keys are pi-tui `Editor` semantics verbatim plus three jie keys; global keys are handled by the TUI's input listener before they reach the editor. All bindings are implemented in `components/editor/jie-editor.ts` (editor keys) and `tui.ts` (global keys); the session picker carries its own keys while open.

## Editor

| Key | What it does | Notes |
| --- | --- | --- |
| `Enter` | Submit the editor buffer | pi semantics; `Shift+Enter` inserts a newline where the terminal reports modifyOtherKeys/Kitty (production path) |
| `Tab` | Complete the highlighted autocomplete suggestion | Inserts the completed token into the buffer; does **not** submit — submit is always `Enter` |
| `↑` / `↓` | Walk prompt history (with draft capture) | pi editor owns this; the global listener does not intercept plain arrows |
| `Esc` | Interrupt the focused agent's in-flight run | only when that agent is busy and no autocomplete popup is showing; otherwise pi closes the popup |
| `Ctrl+C` | Clear the editor if non-empty; otherwise quit | |
| `Ctrl+D` | Quit when the editor is empty | single press — pi semantics |

Everything else is pi-tui `Editor` behavior: cursor/word movement, undo, kill ring, paste markers, IME composition, Kitty/modifyOtherKeys negotiation (production path only; the stream terminal used by tests types plain keys).

## Global

| Key | What it does | Active when |
| --- | --- | --- |
| `Ctrl+T` | Expand / collapse all thinking blocks | always |
| `Ctrl+O` | Expand / collapse all tool cards | always |
| `Shift+↑` or `Ctrl+↑` | Focus the previous agent (insertion order) | always; no-op with fewer than two agents |
| `Shift+↓` or `Ctrl+↓` | Focus the next agent (insertion order) | always; no-op with fewer than two agents |

Both Shift and Ctrl arrow variants are accepted because terminals differ in which they report. The toggles are all-or-nothing across the focused agent's history + current turn (`state.thinkingExpanded` / `state.toolCardsExpanded`); mid-stream toggle re-renders on the next tick. There are **no** `PgUp`/`PgDn`/`Home`/`End`/wheel bindings: finished output is terminal scrollback; scroll and copy are the terminal's native behavior.

## Session picker (while open)

| Key | What it does |
| --- | --- |
| `↑` / `↓` | Move focus (wraps over the filtered list) |
| `Enter` | Resume the focused session |
| `Esc` | Dismiss the picker |
| printable chars | Extend the query filter (focus resets to 0) |
| `Backspace` | Shorten the query |

## Esc vs Ctrl+C vs Ctrl+D

`Esc` interrupts a busy focused agent only; it never clears the editor or quits. `Ctrl+C` clears the editor when non-empty (protecting a half-typed prompt) and quits on an empty buffer. `Ctrl+D` quits on an empty buffer, a single press (pi's exit key).

## Slash commands

Typed into the editor like a prompt; the command handler (`command-handler.ts`) intercepts on submit. Replies are shown as transient messages; failures set the error banner. Unknown `/…` input is an error banner, not a prompt.

| Command | Effect | Reply |
| --- | --- | --- |
| `/help` | Reply with the command cheat-sheet | `type a prompt...  /clear /help /exit /team /model /login /logout` |
| `/clear` | Clear `agents`, `leaderAgentId`, `focusedAgentId`, banners, and the session picker; memory rows on disk untouched | none |
| `/exit` | Quit the TUI (same as `Ctrl+D` on an empty editor); no busy-state branch | none |
| `/login <provider> <apiKey>` | Write one API key entry to `~/.jie/auth.json` (mode `0600` on POSIX) | `logged in to <provider>` |
| `/logout [<provider>]` | Clear one or all entries from `~/.jie/auth.json` | `logged out of <provider>` (or `... of all providers`) |
| `/model <provider>/<modelId>` | Validate and write the default model to settings | `default model set to <provider>/<modelId>` |
| `/team <id>` | Switch the active team (`execute({name:"team"})` then `Actions.switchTeam`); unknown id is an error banner | `loading team '<id>'` |
| `/team` (no arg) | List `defaultTeam` and installed team IDs | `defaultTeam: <id or unset> \| installed: <ids>` |
| `/resume` | List the team's sessions (`listSessions`) and open the session picker | `loading sessions…` |
| `/continue` | Alias for `/resume` | `loading sessions…` |

## Autocomplete

The pi editor's autocomplete popup triggers on two prefixes:

- **`/`** — slash commands (`SLASH_COMMAND_NAMES` from the command handler).
- **`@`** — file mentions: a gitignore-aware scan of `cwd` (`file-mention/`), filtered as you type; the completed token is the relative path, e.g. `@main` + `Tab` → `@src/main.ts `.

`Tab` commits the highlighted suggestion into the buffer; `Enter` submits whatever the buffer holds.

## Conflict-resolution rationale

The TUI runs the terminal in raw mode (owned by pi-tui's `ProcessTerminal` in production), so TTY specials (`Ctrl+C` intr, `Ctrl+D` eof, `Ctrl+O` discard, `Ctrl+T` transpose) arrive as plain bytes and are safe to bind — but only under that contract. Any non-raw input path (e.g. a `jie -p`-style line editor) keeps standard TTY semantics. The TUI binds no window/app lifecycle keys, no clipboard chords (owned by the terminal emulator), and no OS system shortcuts; selection and copy are terminal-native along with the scrollback. It mirrors universal terminal conventions: `Enter` to submit, `Backspace` to erase, `Tab` to complete, `↑`/`↓` history walking, `Esc` to interrupt a busy agent, and `Ctrl+D` as quit muscle memory (honored on an empty buffer, single press, matching pi).
