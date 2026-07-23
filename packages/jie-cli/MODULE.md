---
no-new-exports:
  - cli-flags.test.ts
  - cli-flags.ts
  - index.test.ts
  - index.ts
  - version.ts
---

# Design notes

- `main` is the composition root: it adapts the awilix `bootPlatform`/`bootTui` boots into narrow `(options) => JiePlatform` / `(options, deps) => Tui` deps for `run`, so CLI logic never depends on container cradle shapes.
- `commands/` functions are edge-layer terminal wiring: they receive `(parsed, platform, console)` directly (exempt from "parameters are data") and never reach into platform internals.
