---
no-new-exports:
  - index.ts
  - agent-fixture.ts
  - headless-tui.ts
  - platform-fixture.ts
  - tui-state-fixture.ts
  - virtual-terminal.ts
---

# test
Reusable test fixtures for TUI unit tests. The public surface is `index.ts`, which exports fixture builders. Internal fixtures may be imported directly by co-located tests.
