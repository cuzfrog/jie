---
no-new-exports:
  - cli-flags.test.ts
  - cli-flags.ts
  - index.test.ts
  - index.ts
  - version.ts
---

# Design notes

- `main` adapts `bootPlatform`/`bootTui` into narrow deps for `run`; CLI logic does not depend on container cradle shapes.
- `commands/` are edge-layer wiring: receive `(parsed, platform, console)` directly, never reaching into platform internals.
