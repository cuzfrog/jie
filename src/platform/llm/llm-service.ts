import { contentText, retryAssistantCall, uuidv7, type Api, type AssistantMessage, type AuthResult, type Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ModelRegistry } from "../config";

export interface LlmTaskInput {
  readonly model: Model<Api>;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface LlmService {
  complete(input: LlmTaskInput): Promise<string>;
}

type LlmCallFn = (input: LlmTaskInput, auth: AuthResult | undefined, signal: AbortSignal | undefined) => Promise<AssistantMessage>;

export class LlmServiceImpl implements LlmService {
  private readonly modelRegistry: ModelRegistry;
  private readonly call: LlmCallFn;

  constructor(modelRegistry: ModelRegistry, call?: LlmCallFn) {
    this.modelRegistry = modelRegistry;
    this.call = call ?? callCompleteSimple;
  }

  async complete(input: LlmTaskInput): Promise<string> {
    const auth = await this.modelRegistry.getAuth(input.model.provider);
    const response = await this.call(input, auth, input.signal);
    return responseToText(response);
  }
}

function callCompleteSimple(input: LlmTaskInput, auth: AuthResult | undefined, signal: AbortSignal | undefined): Promise<AssistantMessage> {
  return retryAssistantCall(async (): Promise<AssistantMessage> => {
    return completeSimple(
      input.model,
      {
        systemPrompt: input.systemPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: input.prompt }], timestamp: Date.now() }],
      },
      {
        maxTokens: input.maxTokens,
        apiKey: auth?.auth.apiKey,
        headers: auth?.auth.headers,
        signal,
        cacheRetention: "none",
        sessionId: uuidv7(),
      },
    );
  }, undefined, signal);
}

function responseToText(response: AssistantMessage): string {
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage ?? `llm call failed: ${response.stopReason}`);
  }
  return contentText(response.content);
}