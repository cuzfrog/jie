---
no-new-exports:
  - index.test.ts
  - index.ts
  - tui.ts
  - command-handler.test.ts
  - command-handler.ts
---

# Design principles
- view renders based on state; state changes are upon inputs/events
- try to divide logic into smaller, reusable components, instead of custom functions.
- NO helper functions that are used across files, check project CLAUDE.md for details.
