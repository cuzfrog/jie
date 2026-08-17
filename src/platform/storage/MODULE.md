---
no-new-exports:
  - artifact-store.test.ts
  - artifact-store.ts
  # index.ts re-exports the module surface; SessionUsageStore is part of the new public surface.
  # - index.ts
  - init-db.ts
  - row-decode.test.ts
  - row-decode.ts
  - session-usage-store.test.ts
  - session-usage-store.ts
  - sqlite-storage.test.ts
  - sqlite-storage.ts
  - storage.ts
  - transcript-store.test.ts
  - transcript-store.ts
---

