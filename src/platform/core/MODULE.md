---
no-new-exports:
  - agent-body.ts
  - agent-event-bridge.test.ts
  - agent-event-bridge.ts
  - compaction-runner.test.ts
  - compaction-runner.ts
  - compaction.test.ts
  - compaction.ts
  - jie-agent-body.test.ts
  - jie-agent-body.ts
  - index.ts
  - model-controller.test.ts
  - model-controller.ts
  - module.ts
  - prompt-queue.test.ts
  - prompt-queue.ts
  - streaming.test.ts
  # ungated for DI review: StreamPublisherImpl is the impl class behind StreamPublisher,
  # constructed by the sibling jie-agent-body.ts (house style, not cradle-registered).
  # - streaming.ts
  - system-prompt.test.ts
  - system-prompt.ts
  - tool-adapter.ts
  - tool-call-observer.test.ts
  - tool-call-observer.ts
---

## Contracts
Body components: one interface + `*Impl` per file; impls constructed inside `jie-agent-body.ts` (not cradle-registered). `composeSystemPrompt` assembles context → memory → role prose → skills (deduped, progressive disclosure). Pure; no I/O.
