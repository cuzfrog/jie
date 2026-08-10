---
no-new-exports:
  - index.test.ts
  - tui.ts
  - command-handler.test.ts
  - command-handler.ts
---

# Design principles
- View renders from state; changes come from inputs/events.
- No cross-file helper functions (see CLAUDE.md).
