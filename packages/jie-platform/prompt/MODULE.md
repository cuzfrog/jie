---
no-new-exports:
  - compose.ts
  - index.ts
---

## Contracts

- `composeSystemPrompt` is the single assembler of the LLM system prompt. It takes the role's verbatim prose (the soul's `systemPrompt`) and appends the resolved skills block; the soul stays the immutable declarative profile and composition happens at body construction. Pure: no I/O, no state.
