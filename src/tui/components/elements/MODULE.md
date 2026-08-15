---
no-new-exports:
  # index.ts re-exports low-level reusable element abstractions; see key-hints.ts, model-segment.ts, single-line.ts
  # - index.ts
  - key-hints.ts
  - key-hints.test.ts
  - model-segment.ts
  - model-segment.test.ts
  - single-line.ts
  - single-line.test.ts
---

# Design principles
- Low-level primitives shared across panels/chat/footer; import themes from parent (`../themes`).
- One class or pure formatter per file; helpers file-private.
- Theme-coupled formatters live behind DI interfaces so consumers can mock them.
