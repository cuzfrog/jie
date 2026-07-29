# TUI Keybinding Matrix

The TUI is keyboard-driven. Editor keys are pi-tui `Editor` semantics verbatim plus three jie keys; global keys are handled by the TUI's input listener before they reach the editor. All bindings are implemented in `components/editor/jie-editor.ts` (editor keys) and `components/view.ts` (global keys). The core keys are also listed under the Shortcuts heading of the welcome splash and the `/help` reprint (`tui-layout.md`, "keybinding hints").

## Editor

| Key | What it does | Notes |
| --- | --- | --- |
| `Enter` | Submit the editor buffer — except when the team strip is shown with its cursor on another agent: then it commits that agent as the focused one instead (`tui-team-panel.md`) | pi semantics; `Shift+Enter` inserts a newline where the terminal reports modifyOtherKeys/Kitty (production path) |
| `Tab` | Complete the highlighted autocomplete suggestion | Inserts the completed token into the buffer; does **not** submit — submit is always `Enter` |
| `↑` / `↓` | Walk prompt history (with draft capture) | pi editor owns this — except while the team strip is shown: then the global listener routes plain arrows to the strip's cursor instead (`tui-team-panel.md`) |
| `Esc` | Interrupt the focused agent's in-flight run | only when that agent is busy and no autocomplete popup is showing; otherwise pi closes the popup. The working slot then shows a static `Interrupted` until the agent's next turn starts or the user submits |
| `Ctrl+C` | Clear the editor if non-empty; otherwise quit | |
| `Ctrl+D` | Quit when the editor is empty | single press — pi semantics |

Everything else is pi-tui `Editor` behavior: cursor/word movement, undo, kill ring, paste markers, IME composition, Kitty/modifyOtherKeys negotiation (production path only; the stream terminal used by tests types plain keys).

## Global

| Key | What it does | Active when |
| --- | --- | --- |
| `Ctrl+T` | Expand / collapse all thinking blocks | always |
| `Ctrl+O` | Expand / collapse all tool cards | always |
| `Ctrl+↓` | Toggle the team strip: show it with the cursor on the focused agent, or hide it and clear the cursor (`tui-team-panel.md`) | always; no-op before a team is loaded |

`Ctrl+↓` is the strip's only toggle; while the strip is shown, plain `↑`/`↓` move its cursor (cycling both ways) and the editor's history walk yields (`tui-team-panel.md`, Interaction). `Ctrl+↑` and the `Ctrl+←`/`Ctrl+→` word jumps stay with the editor/terminal. While the autocomplete popup is open, plain arrows navigate the popup, not the strip. The thinking/tool toggles are all-or-nothing across the focused agent's history + current turn (`state.thinkingExpanded` / `state.toolCardsExpanded`); mid-stream toggle re-renders on the next tick. There are **no** `PgUp`/`PgDn`/`Home`/`End`/wheel bindings: finished output is terminal scrollback; scroll and copy are the terminal's native behavior.

## Esc vs Ctrl+C vs Ctrl+D

`Esc` interrupts a busy focused agent only; it never clears the editor or quits. The interrupted run is marked: the working slot shows a static muted `Interrupted` (the `Loader` with empty spinner frames) until the interrupted agent's next turn starts, the user submits, or the team switches (`tui-state.md`, `agent.idle`). `Ctrl+C` clears the editor when non-empty (protecting a half-typed prompt) and quits on an empty buffer. `Ctrl+D` quits on an empty buffer, a single press (pi's exit key).

## Slash commands

Typed into the editor like a prompt; the command handler (`command-handler.ts`) intercepts on submit. Replies are shown as transient messages; failures set the error banner. Unknown `/…` input is an error banner, not a prompt.

| Command | Effect | Reply |
| --- | --- | --- |
| `/help` | Reprint the welcome info into the chat area as an info entry (the splash — mark, wordmark + tagline, team line, Commands and Shortcuts sections, the latter carrying the keybinding hints); the splash hides while the reprint is present (`tui-state.md`, entry sequence) | none |
| `/clear` | Clear `agents`, `leaderAgentId`, `focusedAgentId`, `teamCursorAgentId`, info entries, and banners; reset the entry counter; memory rows on disk untouched | none |
| `/exit` | Quit the TUI (same as `Ctrl+D` on an empty editor); no busy-state branch | none |
| `/login <provider> <apiKey>` | Write one API key entry to `~/.jie/auth.json` (mode `0600` on POSIX). The provider is completed in-flow by autocomplete | `logged in to <provider>` |
| `/logout <provider>\|*` | Clear one provider's entry, or all (`*`), from `~/.jie/auth.json`. The argument is completed in-flow by autocomplete (`*` first, then provider ids) | `logged out of <provider>` (or `... of all providers`) |
| `/logout` (no arg) | Usage error | `/logout <provider>\|*` |
| `/model <provider>/<modelId>` | Validate and write the default model to settings; applies to teams loaded thereafter (no hot-swap of running agents). The argument is completed in-flow by autocomplete — only models whose provider is configured or logged in, further narrowed by any `/model-filter` patterns | `default model set to <provider>/<modelId>` |
| `/model-filter <add\|remove> <pattern>` | Add/remove a case-insensitive substring pattern in settings `modelFilters`; while any pattern is set, `/model` completion offers only matching models. Unknown action, missing pattern, or removing an unset pattern is an error banner | `model filter added: <pattern>` (or `removed`) |
| `/effort <level>` | Write the default effort (`off` \| `low` \| `medium` \| `high` \| `max`) to global settings; applies to teams loaded thereafter (no hot-swap). The level is completed in-flow by autocomplete; an unknown level is an error banner | `default effort set to <level>` |
| `/effort` (no arg) | Query and show the current default effort (`off` when unset) | `default effort: <level>` |
| `/team <id>` | Switch the active team (`execute({name:"team"})` then `Actions.switchTeam`); unknown id is an error banner. The id is completed in-flow by autocomplete | `loading team '<id>'` |
| `/team` (no arg) | Usage error | `/team <teamId>` |
| `/resume <sessionId>` | Resume one session of the loaded team (`execute({name:"resumeSession"})` then `Actions.switchTeam` with the resumed identity); unknown id or no team loaded is an error banner. The id is completed in-flow by autocomplete; a session named via `/rename` shows its name in the popup | `resuming session '<id>'` |
| `/resume` (no arg) | Usage error | `/resume <sessionId>` |
| `/rename <name>` | Name the loaded team's active session (`execute({name:"renameSession"})`; persisted in `session_metadata`, survives restarts). Multi-word names are joined; no team loaded is an error banner. On success the name is recorded in `state.sessionName` — it labels the editor's top border (`tui-layout.md`, Borders) and becomes the `/resume` candidate's label | `session renamed to <name>` |
| `/rename` (no arg) | Usage error | `/rename <name>` |

## Autocomplete

The editor's autocomplete popup (`autocomplete/jie-autocomplete.ts`) triggers on two prefixes:

- **`/`** — slash commands; every row shows the argument hint and one-line description as right-aligned ghost text (from the shared `COMMAND_METADATA`, same as the `/help` cheat-sheet). Seven commands also complete their argument: `/team ` lists installed team ids (`(default)` marked), `/resume ` lists the loaded team's sessions (label = the `/rename` name when present, else the session id; described as `<n> msg · <age>`; filtering matches name or id), `/model ` lists the registry's models as `<provider>/<modelId>` (human-readable model name) — only providers configured or logged in, further narrowed by `/model-filter` patterns, and when patterns hide models the hidden count shows as `(n/total | k filtered)` on the scroll-info line (or an appended `(selected/total | k filtered)` line when the list does not scroll), `/model-filter ` lists the `add`/`remove` actions, then after `remove ` the stored patterns (committed as `remove <pattern>`; `add` stays free-form), `/login ` lists provider ids (its key's env var, or `configured`), `/logout ` lists `*` (all providers) then the provider ids, and `/effort ` lists the five effort levels. When the typed token fuzzy-matches exactly one argument command (e.g. `/resum`), its argument rows appear immediately labeled `<command> <arg>`; multi-match or argument-less commands fall back to the command-name candidates.
- **`@`** — file mentions: a gitignore-aware scan of `cwd` (`file-mention/`), filtered as you type; the completed token is the relative path, e.g. `@main` + `Tab` → `@src/main.ts `.

The popup renders inside the editor's frame; the editor never leaves the layout (`tui-layout.md`, "Selection via editor autocomplete"). The highlighted row's completion also previews inline: its tail beyond the typed prefix renders as `dim` ghost text starting at the editor cursor cell (the first glyph inverted in place, not pushed right), moving with `Up`/`Down` selection; fuzzy matches whose value does not extend the typed prefix show no ghost — unless the slash-command item carries an argument hint, which ghosts on its own even on an exact match (exact `/model` ghosts ` <provider/modelId>`). For slash commands the ghost appends the command's argument hint (`/mo` ghosts `del <provider/modelId>`). With the popup closed, a buffer ending in `/command ` keeps a static argument-hint ghost from the registry (e.g. `/model-filter ` ghosts `<add|remove> <pattern>`), so the hint survives a `Tab` commit; it clears once the buffer stops matching a command boundary. `Tab` commits the highlighted suggestion into the buffer without submitting. `Enter` commits the highlighted suggestion when the popup is open (a second `Enter` then submits); once the typed text already matches an entry exactly the popup closes on its own and `Enter` submits directly. `Esc` closes the popup and keeps the buffer text; it interrupts the focused agent only when no popup is showing.

## Conflict-resolution rationale

The TUI runs the terminal in raw mode (owned by pi-tui's `ProcessTerminal` in production), so TTY specials (`Ctrl+C` intr, `Ctrl+D` eof, `Ctrl+O` discard, `Ctrl+T` transpose) arrive as plain bytes and are safe to bind — but only under that contract. Any non-raw input path (e.g. a `jie -p`-style line editor) keeps standard TTY semantics. The TUI binds no window/app lifecycle keys, no clipboard chords (owned by the terminal emulator), and no OS system shortcuts; selection and copy are terminal-native along with the scrollback. It mirrors universal terminal conventions: `Enter` to submit, `Backspace` to erase, `Tab` to complete, `↑`/`↓` history walking, `Esc` to interrupt a busy agent, and `Ctrl+D` as quit muscle memory (honored on an empty buffer, single press, matching pi).
