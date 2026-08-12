# ADR 30: Rebase jie-tui on `@earendil-works/pi-tui`; delete jie-ink

## Status

Accepted (2026-07). Supersedes ADR 27 (thin editor + pinned footer — the decisions survive, the ink implementation is gone), ADR 28 (node-pty/bun test gap), and ADR 29 (`scrollBottom` / `appendToScrollback`). ADR 25 (the TUI is event-driven) is unaffected — the state store, pure reducer, and bus subscription are unchanged.

## Context

Replaced vendored `jie-ink` (30k LOC) with `@earendil-works/pi-tui` (line-buffer renderer, no React).

## Decision

Rebase jie-tui on pi-tui and delete jie-ink wholesale:

- Inline differential rendering; terminal-native scrollback/selection.
- Editor/layout handled by pi-tui; `createTui` API unchanged.

UX changes: no alt-screen; native scrollback/selection.

Runtime hazards guarded in source.

## Consequences

- `jie-ink` deleted. Deps: +`pi-tui`, `@xterm/headless`. Reference docs kept.
