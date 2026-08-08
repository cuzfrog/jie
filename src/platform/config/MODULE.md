---
no-new-exports:
  - auth-store.test.ts
  - auth-store.ts
  - index.ts
  - load-models.test.ts
  # ungated for DI review: the public `export function resolveValue` is replaced by the
  # `_resolveValue` test seam (house convention, net -1 public export).
  # - load-models.ts
  - load-settings.ts
  - model-registry.test.ts
  - model-registry.ts
  - settings-store.test.ts
  - settings-store.ts
  - types.ts
  - load-settings.test.ts
---


