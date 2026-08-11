---
no-new-exports:
  - command-handler.ts
  - command-handler.test.ts
  - command-resolver.ts
  - command-resolver.test.ts
  - command-registry.ts
  - slash-command.ts
  - positional-slash-command.ts
---

- Parses slash commands and routes them to platform calls, UI state changes, or inline replies.
- Public surface is `index.ts`: command abstractions, the canonical `SLASH_COMMANDS` list, and derived metadata.
- Definitions live in `definitions/` and are consumed through `definitions/index.ts`.
