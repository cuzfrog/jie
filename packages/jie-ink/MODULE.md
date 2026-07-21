---
no-new-exports:
  - src/index.ts
---

# jie-ink

Vendored fork of `ink` 7.1.0 — the React-to-terminal renderer (Yoga flexbox) used by `@cuzfrog/jie-tui`. The public surface matches upstream `ink`'s `src/index.ts` (see `src/index.ts` for the export list); test infrastructure is converted to bun:test with `vi` replacing sinon.

## Why a fork — the actual diff

`jie-tui`'s explicit import surface is 100% upstream-compatible: every import exists in upstream ink 7.1.0 with the same signature. The fork's real delta over upstream is five things:

1. **Selection subsystem (~958 LOC).** Mouse-drag text selection and copy, rendered in-frame. The single largest divergence and the hard blocker for reverting to upstream ink — nothing upstream provides it.
2. **Mouse/wheel pipeline.** Wheel events surface as input that `jie-tui`'s chat pane consumes for scrolling.
3. **`appendToScrollback` render mode** (log-update's `createAppend` strategy). Used alongside `alternateScreen: true` — the interaction is unresolved: under an alternate screen, scrollback retention at unmount may be moot. Flagged for verification.
4. **An `input-parser` correctness fix** over upstream.
5. **`overflow="scrollBottom"` — dead code.** `jie-tui` never uses it; chat panes virtualize at the app level with `overflow="hidden"`. Flagged for removal.

The fork originated from a chat-overflow bug in ink's `shouldClearTerminalForFrame`; vendoring let `jie-tui` iterate on renderer fixes without coordinating upstream.

## Direction: removal

The goal is **complete removal of this package** — `jie-tui` should render on a maintained renderer, not a vendored fork. The candidate replacement is `@earendil-works/pi-tui` (pi monorepo). What blocks a plain revert to upstream ink (selection + mouse/wheel) would need app-level reimplementation or a pi-tui equivalent; the `appendToScrollback` and `scrollBottom` items are expected to drop out for free. Retirement criterion: `jie-tui` renders on the replacement and this package is deleted.

## Conventions
- Tests live next to the impl they cover, with a `.test.ts`/`.test.tsx` suffix.
- `vi` is on the global namespace (provided by the root `tests/test-setup.ts` preload).
- Public surface is intentionally the same as upstream `ink`. Do not add new exports from `src/index.ts` without discussing.
