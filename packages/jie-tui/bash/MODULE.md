---
no-new-exports:
  - bash-mode.ts
  - bash-mode.test.ts
  - submit-routing.test.tsx
  - index.ts
---

# Design principles
- view renders based on state; state changes are upon inputs/events
- view should be pure without side-effect