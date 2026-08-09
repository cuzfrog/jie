---
no-new-exports:
  - themes.ts
  - themes.test.ts
  - index.ts
---

# Design principles
- Pure view from state; no side effects.

## File layout
One component class (plus consumed types) per file; rendering helpers file-private.
