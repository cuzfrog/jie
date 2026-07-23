---
no-new-exports:
  # ungated for DI review: todo tool-result DTOs (TodoItem/TodoStatus/TodoDetailsPayload/
  # isTodoDetails) are cross-boundary DTOs consumed by jie-tui; they must leave through
  # the package surface instead of the current cross-package deep import of types/todo.ts.
  - container.test.ts
  - container.ts
  # - index.ts
  - jie-platform-errors.ts
  - jie-platform.test.ts
  - jie-platform.ts
  # - types.ts
  - utils.test.ts
  - utils.ts
---

## jie-platform
- agents do not directly know each other, they talk via events on an event bus.
- a CLI and a TUI
- provide an interface for `team-blueprint`, but agnostic of `jie-team` or any other team shape
- allow for configuring MCP servers; pluggable tool implementations; provide tool resolution
- storage interface for: context and memory management ; generic business agnostic artifacts
- agnostic of jie-team and code-lens
- depends on `@earendil-works/pi-agent-core`, API Reference in `jie-platform/pi-agent-api-reference.md`. We should follow pi conventions and reuse what it provides. Given a general question, check how does pi solve it.
