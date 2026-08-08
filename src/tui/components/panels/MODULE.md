---
no-new-exports:
  - index.ts
---

# Design principles
- composite panels render a bordered frame with an optional hint line below it
- panels extend the `Panel` base class (template method): override `isVisible`, `body`, and optionally `topBorder`/`hint`
- rendering helpers stay file-private; a pure rendering function complex enough to warrant its own test may live in a sibling file (e.g. `team-table`)

## File layout
- one panel class per file, extending `Panel`
- shared layout lives in `panel.ts`
