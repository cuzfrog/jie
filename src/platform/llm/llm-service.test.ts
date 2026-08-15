import type { Api, AssistantMessage, AuthResult, Model } from "@earendil-works/pi-ai";
import { LlmServiceImpl, type LlmService, type LlmTaskInput } from "./llm-service";
import type { ModelRegistry } from "../config";

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(),
  listProviders: vi.fn(),
  resolve: vi.fn(),
  listModels: vi.fn(),
  getAuth: vi.fn(),
  reload: vi.fn(),
});

function makeModel(): Model<Api> {
  return {
    id: "m",
    name: "m",
    api: "openai-completions" as Api,
    provider: "e2e",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function makeResponse(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions" as Api,
    provider: "e2e",
    model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason,
    errorMessage,
    timestamp: 0,
  };
}

function makeInput(overrides: Partial<LlmTaskInput> = {}): LlmTaskInput {
  return {
    model: makeModel(),
    systemPrompt: "system",
    prompt: "hello",
    ...overrides,
  };
}

const call = vi.fn(
  async (_input: LlmTaskInput, _auth: AuthResult | undefined, _signal: AbortSignal | undefined): Promise<AssistantMessage> => makeResponse("ok"),
);

function makeService(): LlmService {
  return new LlmServiceImpl(modelRegistry, call);
}

beforeEach(() => {
  modelRegistry.getAuth.mockResolvedValue({ auth: { apiKey: "key-1" } });
  call.mockImplementation(
    async (_input: LlmTaskInput, _auth: AuthResult | undefined, _signal: AbortSignal | undefined): Promise<AssistantMessage> => makeResponse("ok"),
  );
});

describe("LlmServiceImpl.complete", () => {
  test("resolves auth and passes it to the call", async () => {
    const service = makeService();
    const input = makeInput();
    const result = await service.complete(input);
    expect(result).toBe("ok");
    expect(modelRegistry.getAuth).toHaveBeenCalledWith("e2e");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]![0]).toBe(input);
    expect(call.mock.calls[0]![1]).toEqual({ auth: { apiKey: "key-1" } });
    expect(call.mock.calls[0]![2]).toBe(undefined);
  });

  test("passes the signal through to the call", async () => {
    const controller = new AbortController();
    const input = makeInput({ signal: controller.signal });
    await makeService().complete(input);
    expect(call.mock.calls[0]![2]).toBe(controller.signal);
  });

  test("passes unresolved auth through unchanged", async () => {
    modelRegistry.getAuth.mockResolvedValue(undefined);
    await makeService().complete(makeInput());
    expect(call.mock.calls[0]![1]).toBe(undefined);
  });

  test("passes resolved auth headers through to the call", async () => {
    modelRegistry.getAuth.mockResolvedValue({ auth: { apiKey: "key-1", headers: { Authorization: "Bearer key-1" } } });
    await makeService().complete(makeInput());
    expect(call.mock.calls[0]![1]).toEqual({ auth: { apiKey: "key-1", headers: { Authorization: "Bearer key-1" } } });
  });

  test("throws with the provider error message on an error stop reason", async () => {
    call.mockImplementation(async () => makeResponse("", "error", "rate limited"));
    await expect(makeService().complete(makeInput())).rejects.toThrow("rate limited");
  });

  test("throws a fallback message on an aborted stop reason without an error message", async () => {
    call.mockImplementation(async () => makeResponse("", "aborted"));
    await expect(makeService().complete(makeInput())).rejects.toThrow("llm call failed: aborted");
  });

  test("propagates a rejected call", async () => {
    call.mockRejectedValue(new Error("boom"));
    await expect(makeService().complete(makeInput())).rejects.toThrow("boom");
  });
});