---
no-new-exports:
  - index.ts
  - memory-bootstrap.ts
  - memory-extractor.test.ts
  - memory-extractor.ts
  - memory-store.test.ts
  - memory-store.ts
  - module.ts
---

## Notes
- `SqliteMemoryStore` and `MemoryExtractorImpl` are the implementations behind the `MemoryStore` and `MemoryExtractor` interfaces; they are registered on the cradle as `memoryStore` and `memoryExtractor` and are not re-exported from `index.ts`. The extraction prompts are adapted from TencentDB-Agent-Memory (MIT).