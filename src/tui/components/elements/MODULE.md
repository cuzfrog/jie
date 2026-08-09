---
no-new-exports:
  - index.ts
---

# Design principles
- Low-level primitives shared across panels/chat/footer; import themes from parent (`../themes`).
- One class or pure formatter per file; helpers file-private.
