---
no-new-exports:
  - agent-body.ts
  - jie-agent-body.test.ts
  - jie-agent-body.ts
  - index.ts
  - streaming.test.ts
  # ungated for DI review: StreamPublisherImpl is the impl class behind StreamPublisher,
  # constructed by the sibling jie-agent-body.ts (house style, not cradle-registered).
  # - streaming.ts
  - tool-adapter.ts
---
