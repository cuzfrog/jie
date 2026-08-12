---
no-new-exports:
  # index.ts and types.ts are ungated: types.ts holds the cross-boundary DTOs (TeamInfo,
  # KanbanCard) that jie-tui consumes through the package surface, and index.ts is that surface.
  # The ToolResultDetails union lives in tools/types.ts and is re-exported from index.ts.
  - container.test.ts
  - container.ts
  # - index.ts
  - jie-platform-errors.ts
  - jie-platform.test.ts
  - jie-platform.ts
  # - types.ts
---

## jie-platform
Event-bus communication; agnostic of team/code-lens; pluggable MCP/tools; depends on pi-agent-core (follow its conventions).
