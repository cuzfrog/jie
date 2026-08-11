---
no-new-exports:
  - index.ts
  - module.ts
  - command-handler.ts
  - command-handler.test.ts
  - command-resolver.ts
  - command-resolver.test.ts
  - command-registry.ts
  - command-registry.test.ts
  - slash-command.ts
  - slash-command.test.ts
  - positional-slash-command.ts
  - positional-slash-command.test.ts
---

- Parses slash commands and routes them to platform calls, UI state changes, or inline replies.
- Public surface is `index.ts`: `registerCommandModule`, `CommandHandler`, `CommandResolver`, `CommandRegistry`, `CommandMeta`, and `SlashCommandDefinition`.
- `CommandRegistry` (in `command-registry.ts`) owns the authoritative `SLASH_COMMANDS`, derived metadata, and alias resolution.
- Definitions live in `definitions/` and are consumed through `definitions/index.ts`; `SLASH_COMMANDS` and `resolveCommandName` are no longer re-exported.
