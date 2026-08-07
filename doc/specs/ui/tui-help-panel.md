# TUI Help Panel (v0.2)

A bottom panel, sibling of the team panel and kanban panel, that displays the full command and shortcut reference. It is toggled by the `/help` slash command and is mutually exclusive with the other bottom panels.

## State

The panel is visible while `state.helpPanelVisible` is true. The state field is toggled by `Actions.showHelp()` and is reset by `Actions.clearTuiState()`.

## Rendering

`components/help-panel.ts` renders a boxed panel below the footer while the panel is visible. The panel is empty while hidden. It prints the same `helpLines` content used by the old welcome splash (`components/welcome-banner.ts`):

- A plain `Commands` heading followed by the slash-command list from the shared `COMMAND_METADATA` registry, one or two columns depending on width.
- A plain `Shortcuts` heading followed by `hintLines` from `components/key-hints.ts`.
- A final dim line: `Type /help to close.`

The content omits the welcome splash's mark, identity block, and team roster; the panel itself supplies the borders.

## Interaction

- `/help` toggles `helpPanelVisible` on and off.
- Opening the help panel hides an open team panel or kanban panel view.
- The footer shows only its identity line while the help panel is open.
- The welcome splash is reduced to a single hint line pointing to `/help` and is not itself a help reference.
