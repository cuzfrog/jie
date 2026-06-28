# TUI Keybinding Matrix

The TUI is keyboard-driven. All keybindings are global (handled by the input listener, not the focused widget) unless noted. Some keys are conditional on the rail being visible or an agent being busy.

## Global

| Key            | What it does                                                  | Active when                                |
| -------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `Enter`        | Submit the editor buffer as a prompt                          | editor focused (always)                    |
| `↑`            | Recall the previous prompt into the editor                    | editor focused, history non-empty          |
| `↓`            | Recall the next prompt into the editor                        | editor focused, currently walking history  |
| `Esc Esc`      | Interrupt the current agent run (abort the in-flight stream) | focused agent is `busy`                    |
| `← ←` (within 300 ms) | Toggle the left rail (agents panel) on / off            | always                                     |
| `Ctrl+T`       | Expand / collapse all thinking blocks in this agent's history | focused agent has at least one thinking block |
| `Ctrl+O`       | Expand / collapse all tool cards in this agent's history      | focused agent has at least one tool card   |
| `Ctrl+C`       | Clear the editor if non-empty; otherwise quit the TUI         | editor focused                             |
| `Ctrl+D` (twice, within 500 ms) | Quit the TUI                                   | always                                     |
| `Ctrl+D` (when busy) | Confirm exit: render `A turn is in flight; exit anyway? [y/N]` (default N); `Enter` re-prompts until y or N | focused agent is `busy` |

## Rail-visible only

When `state.showRail === true`, these are the rail-only keys:

| Key            | What it does                              | Active when                              |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| `Ctrl+↑`       | Focus the previous agent in the rail      | rail visible, more than one agent        |
| `Ctrl+↓`       | Focus the next agent in the rail          | rail visible, more than one agent        |

The rail is hidden by default. The footer line 2 hint switches to reflect which keys are live:

| Rail state  | Footer hint                                  |
| ----------- | -------------------------------------------- |
| hidden      | `←← for agents`                              |
| visible     | `ctl+↑↓ switch agent  ←← close agents`       |

## Esc×2 vs Ctrl+C

`Esc Esc` is a two-press interrupt (matches pi's convention). The first `Esc` does nothing; the second, arriving within 300 ms, aborts the in-flight stream. `Ctrl+C` clears the editor buffer when non-empty; on an empty buffer it quits the TUI. This avoids losing a half-typed prompt to a stray `Ctrl+C`.

## Ctrl+D×2 to quit

A single `Ctrl+D` is a no-op. Two presses within 500 ms quit the TUI. This is a deliberate alternative to `Ctrl+C` for users who prefer `Ctrl+D` as their muscle-memory quit (matches pi's `Ctrl+D` exit).

## Ctrl+T semantics

`Ctrl+T` is **idempotent on the *all-expanded* state**: if every thinking block across history + current turn is already expanded, the press collapses all of them; otherwise, all thinking blocks become expanded. Non-thinking blocks (text, tool cards) are unaffected. The action is a `ui.thinking.toggle` envelope sent to the reducer; the actual `expanded: boolean` lives on each `Block`.

This means:

- First `Ctrl+T` after the agent produces any thinking block → all thinking blocks expand.
- Second `Ctrl+T` → all collapse.
- Mid-stream toggle works — the most recent thinking block will be re-rendered in its new state on the next render tick.

## Ctrl+O semantics

`Ctrl+O` mirrors `Ctrl+T` but for tool cards. Both `tool-call` and `tool-result` cards are toggled together (same `expanded: boolean` flip, all-or-nothing per press). If the focused agent has no cards, the press is a no-op. The action is a `ui.tool.toggle` envelope.

## Rail cycling

`Ctrl+↑` / `Ctrl+↓` cycle `focusedAgentId` in insertion order (the order agents joined the team via `teamLoaded`). The action is a `ui.agent.cycle` envelope sent to the reducer (per `tui-state.md` Reducer rules). With a single agent they are no-ops. They do not affect turn order, history, or any agent's status — only which agent's chat scrollback is shown in the main panel.

## Prompt history

`↑` and `↓` in the editor walk the prompt history (most-recent first). The history is owned by pi-tui's `Editor`; we just call `editor.addToHistory(text)` in the `onSubmit` handler — `↑` / `↓` recall the previous / next entry into the buffer, and once the user steps past the most-recent entry the buffer clears again. While walking, edits are stashed as a "draft" so the user's unsent text is not lost.

`Ctrl+↑` / `Ctrl+↓` are **always** the rail-cycling keys; they bypass the editor. The plain-arrow form is not intercepted by the global input listener, so the editor handles it natively.

## Footer line 1 — CWD + team:agent

Footer line 1 shows the current working directory on the left (taken from `process.cwd()` at TUI startup) and `teamId:focusedAgentId` on the right. It is a stable identity strip: CWD never changes mid-session, and the right side updates only on team switch or agent focus change. The model + effort level moves to footer line 2 right.

## Slash commands

Slash commands are typed at the editor prompt (no key chord). Each starts with `/`; the editor treats the line as a command rather than a prompt and dispatches synchronously without publishing to the bus.

| Command | Effect | Transient message |
|---|---|---|
| `/login` | Open a `SelectList` of providers (from `pi-ai`'s `getProviders()`); on select, open a hidden `Input` for the API key; write to `~/.jie/auth.json` (mode `0600`) | `logged in to <provider>` |
| `/logout [<provider>]` | Clear one or all entries from `~/.jie/auth.json` | `logged out of <provider>` (or `logged out of all providers`) |
| `/model <provider>/<modelId>` | Validate and write to `~/.jie/settings.json` | `default model set to <provider>/<modelId>` |
| `/team <id>` | If installed, call `loadTeam(id)`; the TUI's `teamId` switches (per `tui.md` "Multi-team"). If not installed, render the error `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/` in the input area; no team switch | `default team set` (only on direct write to settings) |
| `/team` (no arg) | Open a `SelectList` with `fuzzyFilter` over installed team IDs; selecting one is equivalent to `/team <id>` | none (picker selection does not write settings) |
| `/team --unset` | Clear `defaultTeam` from `.jie/settings.json`; takes effect on next `jie` invocation. Mid-session unset is not supported | `default team unset` |
| `/clear` | Clear `state.agents` (all agents' history + currentTurn), `state.queue`, `state.transientMessage`. Memory rows on disk untouched. Publishes `ui.clear` to the reducer | none |
| `/help` | Open an overlay rendering the keymap from this doc | none |
| `/exit` | Same as `Ctrl+D` (twice within 500 ms). Honors the busy-state confirmation when a turn is in flight | none |

`/clear` and `/help` are listed here for the first time; they are new in v0.2.
