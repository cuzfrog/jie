---
no-new-exports:
  - src/index.ts
---

# jie-ink

Bundled `ink` 7.1.0 (vendored) for `@cuzfrog/jie-tui`. Ink renders React to a terminal using Yoga for flexbox layout; jie-ink is a near-verbatim copy of upstream ink with test infrastructure converted to bun:test and sinon replaced by `vi` spies/stubs.

The surface is the same as upstream `ink`'s `src/index.ts`. See `src/index.ts` for the export list.

## Why a fork
The chat-overflow bug required investigation into ink's `shouldClearTerminalForFrame`. Vendoring ink lets `jie-tui` iterate on fixes without coordinating with upstream and without taking on an `npm` dependency for what is effectively internal infrastructure. Once upstream lands an escape hatch for sticky-bottom rendering, the package can be retired.

## Conventions
- Tests live next to the impl they cover, with a `.test.ts`/`.test.tsx` suffix.
- `vi` is on the global namespace (provided by the root `tests/test-setup.ts` preload).
- Public surface is intentionally the same as upstream `ink`. Do not add new exports from `src/index.ts` without discussing.
