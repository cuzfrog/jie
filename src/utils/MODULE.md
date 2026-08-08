---
no-new-exports:
  - console.ts
  - index.ts
  - logger.test.ts
  - logger.ts
---

# Design principles
- Process-level infrastructure shared by all jie packages: diagnostic logging and the `Console` output abstraction.
- No domain logic. This package must not depend on any other jie package.
