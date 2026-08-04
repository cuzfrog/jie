---
no-new-exports:
  - agent-body.ts
  - compaction.test.ts
  - compaction.ts
  - jie-agent-body.test.ts
  - jie-agent-body.ts
  - index.ts
  - module.ts
  - streaming.test.ts
  # ungated for DI review: StreamPublisherImpl is the impl class behind StreamPublisher,
  # constructed by the sibling jie-agent-body.ts (house style, not cradle-registered).
  # - streaming.ts
  - tool-adapter.ts
---
