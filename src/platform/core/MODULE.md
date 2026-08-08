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

- Body components (`prompt-queue.ts`, `tool-call-observer.ts`, `agent-event-bridge.ts`, `compaction-runner.ts`, `model-controller.ts`): each file exports one primary interface (plus narrow dep-handle interfaces where its deps need them) and its `*Impl` class. The impl classes are constructed inside `jie-agent-body.ts`'s constructor — house style like `StreamPublisherImpl`: not cradle-registered, not re-exported from `index.ts`, known only to the sibling body and their unit tests. Deps interfaces are file-private; the body passes object literals with narrow handles into the pi-agent `Agent` — state getters/setters or dispatch actions, never the `Agent` itself — so the components stay decoupled from pi-agent-core's mutable surface. Behavior contracts live in `06-agent-model.md` (AgentBody "Internal components").
- `composeSystemPrompt` (system-prompt.ts) is the single assembler of the LLM system prompt. Order is: the shared context-files block (when non-empty), then the long-term memory block (when non-empty; loaded by the body at restore, `11-memory.md`), then the role's verbatim prose (the soul's `systemPrompt`), then the skills block, which it assembles itself: dedupe by name (first occurrence wins), the progressive-disclosure header prose, and the `<available_skills>` wrapper around each skill's own `promptEntry()`; an empty or missing skill list contributes nothing. The soul stays the immutable declarative profile; composition happens at body construction and is re-run after the restore-phase memory load. Pure: no I/O, no state. Not re-exported from `index.ts` — consumed only by the sibling `jie-agent-body.ts`.
