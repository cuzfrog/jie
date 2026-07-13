---
sealed:
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

# Reducer sharing pattern

When a piece of reducer logic is needed by both the event bus and a UI action
(e.g. `system.team.loaded` and `Actions.switchTeam` both build the same
agent-map from a `TeamInfo`), extract it into a dedicated `<thing>-reducer.ts`
file in this module. The named reducer is the single source of truth; the
event-side and UI-side reducers each import and delegate to it.

- File naming: `<noun>-reducer.ts`, camelCase exported function `<noun>Reducer`.
  Companion test: `<noun>-reducer.test.ts`.
- Both `event-reducer.ts` and `ui-reducer.ts` may import from the shared
  file, but neither may re-export it (the export surface of those sealed
  files is fixed).

This pattern keeps the two entry points thin and guarantees a single
implementation of the shared transformation.
