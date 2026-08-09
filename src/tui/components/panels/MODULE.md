---
no-new-exports:
  - index.ts
---

# Design principles
- Panels extend `Panel`: override `isVisible`, `body`, optionally `topBorder`/`hint`. Shared layout in `panel.ts`.
