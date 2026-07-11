---
sealed:
  - useStateStore.ts
  - useStateStore.test.tsx
---
- no need to export hook return types
- use `useCallback` to make returned functions stable

# Naming convention
Each hook lives in a file named after the hook (camelCase), e.g. `useStateStore.ts` exports `useStateStore`.
The companion test file follows the same name with a `.test.tsx` suffix.
