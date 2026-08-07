---
no-new-exports:
  - memory-manager.ts
  - memory-manager.test.ts
  - index.ts
  - module.ts
---

## Notes
- `MemoryManager` is the only public abstraction of the module. `Memory`, `MemoryType`, and `RawMemory` are exported as cross-boundary DTOs; `DistillationInput` is the input shape for distillation and is re-exported from `index.ts`.
- `SqliteMemoryStore`, `MemoryWriterImpl`, `MemoryDistillerImpl`, and `MemoryBootstrapImpl` are implementation details inside the module; they are not re-exported from `index.ts`.
- `MemoryManagerImpl` delegates to `MemoryWriter` for explicit writes (and distillation), `MemoryStore` for search, `MemoryDistiller` for distill, and `MemoryBootstrap` for render via constructor injection. The module registration uses plain `asClass` for all collaborators, relying on `CLASSIC` injection mode to resolve dependencies by constructor parameter name.
- `MemoryWriter` is the dedicated write-path service: it validates `RawMemory` values and delegates persistence to `MemoryStore`. Both `MemoryManager.add` and `MemoryDistiller` use it so all writes share the same validation and reinforcement path.
