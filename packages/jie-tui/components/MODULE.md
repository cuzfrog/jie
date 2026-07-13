---
sealed:
  - app.tsx
  - app.test.tsx
  - global-keys.tsx
  - global-keys.test.tsx
  - context.tsx
  - context.test.tsx
  - themes.ts
  - themes.test.ts
  - index.ts
---

# Design principles
- view renders based on state; state changes are upon inputs/events
- view should be pure without side-effect

## File layout
- shared hooks go into `hooks/`
- component specific hooks go along side the specific component file

# Hooks Naming convention
Each hook lives in a file named after the hook (camelCase), e.g. `useStateStore.ts` exports `useStateStore`.
The companion test file follows the same name with a `.test.tsx` suffix.
