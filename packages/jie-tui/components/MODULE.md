---
no-new-exports:
  - themes.ts
  - themes.test.ts
  - index.ts
---

# Design principles
- view renders based on state; state changes are upon inputs/events
- view should be pure without side-effect

## File layout
- a component file exports one `Component` class plus the types it consumes; rendering helpers stay file-private
