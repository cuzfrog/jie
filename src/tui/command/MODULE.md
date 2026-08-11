---
no-new-exports:
  - command-handler.ts
  - command-handler.test.ts
  - command-resolver.ts
  - command-resolver.test.ts
---

- Parses slash commands and routes them to platform calls, UI state changes, or inline replies.
- Exposes a registry of slash-command definitions and derived metadata for help, autocomplete, and the editor.
- Definitions live in `definitions/`; shared argument helpers live in `arguments/`.
