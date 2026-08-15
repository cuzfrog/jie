# LLM Service

## Purpose

One-shot model invocations outside any agent session. Compaction and memory extraction are the consumers; any future standalone task (summarization, translation, distillation) reuses the same path. The agent loop calls models through pi-agent; everything else calls through this service. One exported interface, module `src/platform/llm/`, cradle key `llmService`.

## Interface

```typescript
interface LlmTaskInput {
  readonly model: Model<Api>;          // pi-ai Model object — the caller decides which model
  readonly systemPrompt: string;
  readonly prompt: string;             // rendered as a single user message
  readonly maxTokens?: number;         // absent → the model's own cap applies, nothing invented
  readonly signal?: AbortSignal;
}

interface LlmService {
  complete(input: LlmTaskInput): Promise<string>;
}
```

The `Model` is data the caller supplies — the service owns no model selection policy. Credentials are the service's job: it resolves the provider's auth at call time via `ModelRegistry.getAuth` ("Credentials Resolution" in `10-configuration.md`) and never accepts a key from callers.

## Behavior

- Implemented on `completeSimple` from `@earendil-works/pi-ai/compat` — the promise-returning sibling of the `streamSimple` the agent loop streams through — wrapped in pi's `retryAssistantCall` with an undefined policy (single attempt; the wrapper contributes abort normalization and the seam where a settings-driven retry policy can plug in later). Standalone-request isolation: `cacheRetention: "none"` and a fresh `sessionId` (uuid v7) per call — a standalone request must not write cache entries the agent loop cannot reuse, nor read ones it owns. Compat is pi's temporary legacy surface (deleted with its ModelManager migration; `createModels()` is the successor); the whole platform hangs off it through the agent loop, so this module migrates in the same future change as the loop rather than on its own timeline.
- `stopReason` `"error"` or `"aborted"` → throw with the provider's error message; any other stop reason returns `contentText(response.content)`.
- A missing credential does not throw at resolution — the call fails with the provider's auth error, same as agent-loop calls.

## Consumers

| Consumer | Model choice | Notes |
|---|---|---|
| `Compactor` (`08-transcript.md`) | the body's model | The compactor's private `summarizeConversation` and its `apiKey` threading are removed; `CompactionInput` loses the `apiKey` field. Compaction's system/user prompts stay (`compaction.ts`). |
| `MemoryDistiller` (`11-memory.md`) | `settings.memory.model` when set, else the agent's model | Unresolvable `memory.model` → WARN + fall back to the agent's model. |
