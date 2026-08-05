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

- `composeSystemPrompt` (system-prompt.ts) is the single assembler of the LLM system prompt. Order is: the shared context-files block (when non-empty), then the role's verbatim prose (the soul's `systemPrompt`), then the skills block, which it assembles itself: dedupe by name (first occurrence wins), the progressive-disclosure header prose, and the `<available_skills>` wrapper around each skill's own `promptEntry()`; an empty or missing skill list contributes nothing. The soul stays the immutable declarative profile and composition happens at body construction. Pure: no I/O, no state. Not re-exported from `index.ts` — consumed only by the sibling `jie-agent-body.ts`.
