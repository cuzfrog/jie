---
no-new-exports:
  - index.ts
  - module.ts
  - help-panel.ts
  - help-panel.test.ts
  - kanban-panel.ts
  - kanban-panel.test.ts
  - panel.ts
  - team-panel.ts
  - team-panel.test.ts
  - team-table.test.ts
---

# Design principles
- Panels extend `Panel`: override `isVisible`, `body`, optionally `topBorder`/`hint`. Shared layout in `panel.ts`.
- Panels that take keyboard input implement `Component.handleInput` and receive a key-fallback target; the view focuses a visible input-taking panel and the panel delegates unhandled keys to the fallback.
