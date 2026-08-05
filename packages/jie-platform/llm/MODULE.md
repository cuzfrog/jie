---
no-new-exports:
  - index.ts
  - llm-service.test.ts
  - llm-service.ts
  - module.ts
---

## Notes
- `LlmServiceImpl` is the implementation behind the `LlmService` interface; it is registered on the cradle as `llmService` and is not re-exported from `index.ts`. The `call` seam on `LlmServiceDeps` swaps the `completeSimple` + `retryAssistantCall` edge for unit tests.
