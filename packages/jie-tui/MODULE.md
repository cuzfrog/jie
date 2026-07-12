---
sealed:
  - index.test.ts
  - index.ts
  - tui.test.tsx
  - tui.ts
  - command-handler.test.ts
  - command-handler.ts
  - git-service.test.ts
  - git-service.ts
  - test-support.ts
---

# Design principles
- view renders based on state; state changes are upon inputs/events
- try to divide logic into smaller, reusable components and hooks, instead of custom functions.
- NO helper functions that are used across files, check project CLAUDE.md for details.
