---
no-new-exports:
  - index.ts
---

# Design principles
- low-level, reusable UI primitives and pure formatters shared across composite modules (panels, chat, footer)
- components render based on state; rendering helpers stay file-private
- `themes` lives at the parent `components/` root as a shared kernel; import via `../themes`

## File layout
- a file exports one `Component` class or one pure formatter; rendering helpers stay file-private
