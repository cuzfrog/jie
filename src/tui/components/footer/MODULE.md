---
no-new-exports:
  - footer.ts
  - queue-indicator.test.ts
---

# Design principles
- Footer layout and the queue indicator are DI services so the footer can be unit-tested with mockable formatters.
