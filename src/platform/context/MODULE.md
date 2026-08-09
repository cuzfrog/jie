---
no-new-exports:
  - format-context.ts
  - index.ts
  - load-context-files.ts
  - module.ts
  - types.ts
---

## Contracts
Reads `AGENTS.md` then `CLAUDE.md` from home and `cwd` ancestors (global→specific); missing files skipped silently. `registerContextModule` provides reloadable loader used per body construction.
