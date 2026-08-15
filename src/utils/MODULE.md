---
no-new-exports:
  - console.ts
  # index.ts re-exports shared technical utilities; see list-files.ts
  # - index.ts
  - list-files.ts
  - list-files.test.ts
  - logger.test.ts
  - logger.ts
---

# Design principles
Process-level logging/console infrastructure and shared technical utilities; no domain logic; no cross-package dependencies.
