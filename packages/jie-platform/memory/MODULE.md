---
no-new-exports:
#  - index.ts        # public API updated: MemoryAtomInput, MemoryBootstrap
  - memory-bootstrap.test.ts
#  - memory-bootstrap.ts   # new MemoryBootstrap interface + impl
  - memory-extractor.test.ts
  - memory-extractor.ts
  - memory-store.test.ts
#  - memory-store.ts   # public type rename: NewMemoryAtom -> MemoryAtomInput
  - module.ts
---

## Notes
- `SqliteMemoryStore`, `MemoryExtractorImpl`, and `MemoryBootstrapImpl` are the implementations behind the `MemoryStore`, `MemoryExtractor`, and `MemoryBootstrap` interfaces; they are registered on the cradle as `memoryStore`, `memoryExtractor`, and `memoryBootstrap` and are not re-exported from `index.ts`. The extraction prompts are adapted from TencentDB-Agent-Memory (MIT).
- The public input DTO is `MemoryAtomInput`; `MemoryAtom` extends it with persisted fields. `NewMemoryAtom` was renamed to `MemoryAtomInput` as part of the input/persisted split.
