---
no-new-exports:
  - memory-manager.ts
  - memory-manager.test.ts
  - index.ts
  - module.ts
---

## Notes
Public abstraction: `MemoryManager`. Implementation (`SqliteMemoryStore`, `WriterImpl`, etc.) stays private. `MemoryWriter` validates and persists; `MemoryDistiller` and `MemoryBootstrap` handled by constructor injection (`CLASSIC` mode).
