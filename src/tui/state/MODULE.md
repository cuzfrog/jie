---
no-new-exports:
  - index.ts
  - state.test.ts
  - state.ts
  - state-store.test.ts
  - state-store.ts
  - reducer.test.ts
  - reducer.ts
  - ui-reducer.test.ts
  - ui-reducer.ts
  - event-reducer.test.ts
  - event-reducer.ts
  - actions.ts # follow existing type's shape, do not overhaul the file.
---

# Reducer sharing
Shared reducer logic (used by both event bus and UI actions) lives in `<noun>-reducer.ts`. Named reducer is the single source; event-side and UI-side reducers delegate to it without re-exporting.
