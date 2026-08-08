---
no-new-exports: []
---

# test
Headless TUI harness for screen-level tests: a virtual terminal (xterm.js headless) consumes the escape sequences jie-tui renders, so tests and smoke drivers can assert on the actually rendered screen as text.
- `virtual-terminal.ts` — xterm.js-headless backed `Terminal`; escape-sequence sink + viewport/scrollback readers.
- `headless-tui.ts` — boots `createTui` over in-memory streams piped into a `VirtualTerminal`, against a real `JiePlatform` pointed at the mock LLM backend.
- `screen.test.ts` — screen-level rendering tests over a fake platform: streamed text in the viewport, picker overlay band, long-content render safety.
