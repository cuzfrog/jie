---
no-new-exports:
  # index.ts re-exports the module surface; new cross-boundary types may pass through.
  # - index.ts
  - agent-registry.test.ts
  - agent-registry.ts
  - module.test.ts
  - module.ts
  - parser.test.ts
  - parser.ts
  - registry.test.ts
  - registry.ts
  - team-manager.test.ts
  - team-manager.ts
  - text.d.ts
  - types.ts
---

## Contracts
`load` emits `system.team.loaded` only on fresh loads; cache hits silent. `resolveTeamId` fallback chain ensures a runnable team always exists. `reload` rebuilds loaded teams in place, bypassing session validation for zero-message sessions.
