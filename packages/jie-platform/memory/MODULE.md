---
no-new-exports:
  - memory-manager.ts
  - memory-manager.test.ts
  - index.ts
  - module.ts
---

## Notes
- `MemoryManager` is the only public abstraction of the module. `Memory`, `MemoryType`, and `RawMemory` are exported as cross-boundary DTOs; `DistillationInput` is the input shape for distillation and is re-exported from `index.ts`.
- `SqliteMemoryStore`, `MemoryDistillerImpl`, and `MemoryBootstrapImpl` are implementation details inside the module; they are not re-exported from `index.ts`.
- `MemoryManagerImpl` delegates to `MemoryStore` (search), `MemoryDistiller` (distill), and `MemoryBootstrap` (render) via constructor injection. The module registration uses plain `asClass` for all four, relying on `CLASSIC` injection mode to resolve dependencies by constructor parameter name.
