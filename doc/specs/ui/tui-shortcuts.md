# TUI Keybinding Matrix

The TUI is keyboard-driven. All keybindings are global (handled by the input listener, not the focused widget) unless noted. Some keys are conditional on the rail being visible or an agent being busy.
- Must check conflicts in @key-shortcuts-conflicts.md

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
| `Ctrl+C`       | Clear the editor if non-empty; otherwise quit the TUI         | editor focused                             |
| `Ctrl+D` (twice, within 500 ms) | Quit the TUI                                   | always                                     |

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

## Ctrl+T and Ctrl+O

Both toggles are **component-local** — `MessageView` owns the per-block `expanded` flag for thinking blocks, `ToolCard` owns it for tool cards. There is no reducer action for either. The toggles are all-or-nothing across the focused agent's history + current turn; `Ctrl+T` does not affect tool cards and `Ctrl+O` does not affect thinking blocks. Mid-stream toggle works: the most recent block re-renders in its new state on the next render tick.

## Prompt history

`↑` / `↓` in the editor walk the prompt history (most-recent first). Owned by pi-tui's `Editor`; we call `editor.addToHistory(text)` in the `onSubmit` handler. `Shift+↑` / `Shift+↓` and `Ctrl+↑` / `Ctrl+↓` are rail-cycling keys and bypass the editor; the plain-arrow form is not intercepted by the global input listener, so the editor handles it natively.

## Slash commands

Slash commands are typed at the editor prompt (no key chord). Each starts with `/`; the editor treats the line as a command rather than a prompt and dispatches synchronously without publishing to the bus.

| Command | Effect | Transient message |
|---|---|---|
| `/login` | Open a `SelectList` of providers; on select, prompt for the API key; write to `~/.jie/auth.json` (mode `0600`) | `logged in to <provider>` |
| `/logout [<provider>]` | Clear one or all entries from `~/.jie/auth.json` | `logged out of <provider>` (or `logged out of all providers`) |
| `/model <provider>/<modelId>` | Validate and write to `~/.jie/settings.json` | `default model set to <provider>/<modelId>` |
| `/team <id>` | If installed, switch the TUI's active team. If not installed, render the error in the input area; no team switch | `default team set` (only on direct write to settings) |
| `/team` (no arg) | Open a `SelectList` over installed team IDs; selecting one is equivalent to `/team <id>` | none |
| `/clear` | Clear `state.agents`, `leaderAgentId`, `focusedAgentId`, `transientMessage`, `errorBanner`. Memory rows on disk untouched | none |
| `/help` | Open an overlay rendering the keymap from this doc | none |
| `/exit` | Same as `Ctrl+D` (twice within 500 ms). No busy-state branch | none |

`/clear` and `/help` are listed here for the first time; they are new in v0.2.
