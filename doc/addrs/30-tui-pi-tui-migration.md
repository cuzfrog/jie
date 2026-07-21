# ADR 30: Rebase jie-tui on `@earendil-works/pi-tui`; delete jie-ink

## Status

Accepted (2026-07). Supersedes ADR 27 (thin editor + pinned footer — the decisions survive, the ink implementation is gone), ADR 28 (node-pty/bun test gap), and ADR 29 (`scrollBottom` / `appendToScrollback`). ADR 25 (the TUI is event-driven) is unaffected — the state store, pure reducer, and bus subscription are unchanged.

## Context

jie-tui rendered through `jie-ink`, a vendored fork of ink 7.1.0 (30,028 LOC incl. tests). The fork existed for four bindings: wheel-scroll input, `appendToScrollback`, the selection/mouse engine under the alternate screen, and a parser fix. Every one of them is a cost that buys a feature an inline renderer would not need. Meanwhile the repo already depends on the pi ecosystem (`pi-agent-core`, `pi-ai`), and pi's own TUI library `@earendil-works/pi-tui` is an imperative line-buffer renderer (`Component = render(width): string[] + handleInput(data)`) with zero React and the batteries jie hand-rolled: an `Editor` with undo, kill ring, history, autocomplete, IME, and Kitty/modifyOtherKeys; `Markdown`; `SelectList`; `Loader`; width utilities.

## Decision

Rebase jie-tui on pi-tui and delete jie-ink wholesale:

- **Inline differential rendering into the normal terminal buffer** — no alternate screen. Finished conversation output is the terminal's own scrollback; selection and copy are the terminal's native behavior. The app keeps no scrollback buffer and handles no mouse/wheel.
- **The state store stays the single source of truth.** Bus envelopes still reduce through the pure reducer; a `store.subscribe` line runs a structural chat-sync (append/finalize/clear child components by `history.length` / `currentTurn` identity / `cards.length` / `blocks.length`) and coalesced `requestRender()`. Components pull their slice in `render(width)`.
- **Editor controls are pi's verbatim plus three jie keys** (`Esc` interrupt busy focused agent, `Ctrl+C` clear-or-quit, `Ctrl+D` quit on empty buffer — single press). `Tab` completes autocomplete suggestions and does not submit; `Enter` submits. The only jie additions are the agent-cycle keys (`Shift/Ctrl+↑↓`), always active — the side rail is replaced by agent status in the footer's identity strip.
- **Public API unchanged**: `createTui(options, deps) → Tui {state, start(), stop()}`; e2e asserts on `tui.state`, never frames, so the acceptance suite survived the swap (autocomplete scenarios rewritten to pi's Tab-completes-not-submits semantics).

Accepted UX changes (user-approved): no alt-screen; terminal-native selection instead of in-frame drag; terminal scrollback instead of app-level wheel scroll/virtualization; footer agent status instead of the side rail; pi's editor as a strict superset of jie's minimal one.

Two runtime hazards are guarded in code: pi-tui's `doRender` throws on any line wider than the terminal — every custom component truncates to the given width (pinned by fuzz tests); and the logger's sink is redirected to `stderr` at startup — pi-tui has no `patchConsole`, so a stray `stdout` write would shred the inline renderer.

## Consequences

- `packages/jie-ink` deleted (−30,028 LOC). jie-tui deps: −`@cuzfrog/jie-ink`, −`react`, −`wrap-ansi`; +`@earendil-works/pi-tui` (catalog). Root tsconfig drops `jsx`; jie-tui gains `@xterm/headless` (devDep) for screen-level render tests.
- The TUI's production terminal path is pi's `ProcessTerminal` (Kitty/modifyOtherKeys negotiation); tests use a stream terminal over injected streams.
- Git info for the footer is wired through the CLI (`createGitService` re-exported from jie-platform; fixes #155), since pi's layout reads dimensions itself and the CLI is the composition root.
- The reference docs `tui-pi-reference.md` / `tui-pi-editor-reference.md` are kept as dependency docs.
