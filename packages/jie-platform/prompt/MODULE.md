---
no-new-exports:
  - compose.ts
  - index.ts
---

## Contracts

- `composeSystemPrompt` is the single assembler of the LLM system prompt. Order is: the shared context-files block (when non-empty), then the role's verbatim prose (the soul's `systemPrompt`), then the skills block, which it assembles itself: dedupe by name (first occurrence wins), the progressive-disclosure header prose, and the `<available_skills>` wrapper around each skill's own `promptEntry()`; an empty or missing skill list contributes nothing. The soul stays the immutable declarative profile and composition happens at body construction. Pure: no I/O, no state.
