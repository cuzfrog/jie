---
no-new-exports:
  - index.test.ts
  - tui.ts
---

# Design principles
- View renders from state; changes come from inputs/events.
- No cross-file helper functions (see CLAUDE.md).
