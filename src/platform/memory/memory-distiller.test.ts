import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, SettingsStore } from "../config";
import type { LlmService } from "../llm";
import { MemoryDistillerImpl, type DistillationInput } from "./memory-distiller";
import type { MemoryWriter } from "./memory-writer";

const llmService = vi.mocked<LlmService>({ complete: vi.fn() });
const memoryWriter = vi.mocked<MemoryWriter>({ write: vi.fn() });
const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(),
  listProviders: vi.fn(),
  resolve: vi.fn(),
  listModels: vi.fn(),
  getAuth: vi.fn(() => Promise.resolve(undefined)),
  reload: vi.fn(),
});
const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});

const agentModel = makeModel("agent");

function makeModel(id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "e2e",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function makeInput(overrides: Partial<DistillationInput> = {}): DistillationInput {
  return { messages: [], teamId: "team-a", sessionId: "s1", model: agentModel, ...overrides };
}

function makeService(): MemoryDistillerImpl {
  return new MemoryDistillerImpl(llmService, memoryWriter, modelRegistry, settingsStore);
}

beforeEach(() => {
  settingsStore.load.mockReturnValue({});
  llmService.complete.mockResolvedValue(
    JSON.stringify([{ scene: "auth migration", memories: [{ content: "auth stays on mobile", type: "fact", priority: 80 }] }]),
  );
  memoryWriter.write.mockReturnValue(1);
});

describe("MemoryDistillerImpl.distill", () => {
  test("stores parsed memories with the team, scene, and session", async () => {
    await makeService().distill(makeInput());
    expect(llmService.complete).toHaveBeenCalledTimes(1);
    expect(memoryWriter.write).toHaveBeenCalledWith(
      [{ content: "auth stays on mobile", type: "fact", priority: 80, scene: "auth migration" }],
      "team-a",
      "s1",
    );
  });

  test("sends the agent model and conversation prompt by default", async () => {
    await makeService().distill(makeInput());
    const input = llmService.complete.mock.calls[0]![0];
    expect(input.model).toBe(agentModel);
    expect(input.prompt).toContain("<conversation>");
  });

  test("resolves memory.model through the registry when configured", async () => {
    const memoryModel = makeModel("mem");
    settingsStore.load.mockReturnValue({ memory: { model: "e2e/mem" } });
    modelRegistry.resolve.mockReturnValue(memoryModel);
    await makeService().distill(makeInput());
    expect(modelRegistry.resolve).toHaveBeenCalledWith("e2e", "mem");
    expect(llmService.complete.mock.calls[0]![0].model).toBe(memoryModel);
  });

  test("falls back to the agent model on an unresolvable memory model", async () => {
    settingsStore.load.mockReturnValue({ memory: { model: "e2e/mem" } });
    modelRegistry.resolve.mockReturnValue(undefined);
    await makeService().distill(makeInput());
    expect(llmService.complete.mock.calls[0]![0].model).toBe(agentModel);
  });

  test("falls back to the agent model on an invalid memory.model format", async () => {
    settingsStore.load.mockReturnValue({ memory: { model: "no-provider" } });
    await makeService().distill(makeInput());
    expect(llmService.complete.mock.calls[0]![0].model).toBe(agentModel);
  });

  test("uses the zh prompt template when language is zh", async () => {
    settingsStore.load.mockReturnValue({ language: "zh" });
    await makeService().distill(makeInput());
    expect(llmService.complete.mock.calls[0]![0].systemPrompt).toContain("记忆蒸馏专家");
  });

  test("skips distillation when memory is disabled", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    await makeService().distill(makeInput());
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(memoryWriter.write).not.toHaveBeenCalled();
  });

  test("drops invalid types and passes parsed priorities through unmodified", async () => {
    llmService.complete.mockResolvedValue(
      JSON.stringify([
        {
          scene: "s",
          memories: [
            { content: "a", type: "bogus", priority: 50 },
            { content: "b", type: "instruction", priority: 1 },
            { content: "c", type: "fact", priority: 150 },
          ],
        },
      ]),
    );
    await makeService().distill(makeInput());
    const memories = memoryWriter.write.mock.calls[0]![0];
    expect(memories).toEqual([
      { content: "b", type: "instruction", priority: 1, scene: "s" },
      { content: "c", type: "fact", priority: 150, scene: "s" },
    ]);
  });

  test("defaults a blank priority string to 50", async () => {
    llmService.complete.mockResolvedValue(
      JSON.stringify([{ scene: "s", memories: [{ content: "x", type: "fact", priority: "" }] }]),
    );
    await makeService().distill(makeInput());
    const memories = memoryWriter.write.mock.calls[0]![0];
    expect(memories).toEqual([{ content: "x", type: "fact", priority: 50, scene: "s" }]);
  });

  test("accepts numeric-string priorities and defaults non-numbers", async () => {
    llmService.complete.mockResolvedValue(
      JSON.stringify([
        {
          scene: "s",
          memories: [
            { content: "a", type: "fact", priority: "80" },
            { content: "b", type: "fact", priority: "not-a-number" },
          ],
        },
      ]),
    );
    await makeService().distill(makeInput());
    const memories = memoryWriter.write.mock.calls[0]![0];
    expect(memories).toEqual([
      { content: "a", type: "fact", priority: 80, scene: "s" },
      { content: "b", type: "fact", priority: 50, scene: "s" },
    ]);
  });

  test("skips scenes without a scene name and stores nothing when the batch is empty", async () => {
    llmService.complete.mockResolvedValue(JSON.stringify([{ scene: "", memories: [{ content: "x", type: "fact", priority: 50 }] }]));
    await makeService().distill(makeInput());
    expect(memoryWriter.write).not.toHaveBeenCalled();
  });

  test("drops the whole batch on unparseable output", async () => {
    llmService.complete.mockResolvedValue("```json\nnot json\n```");
    await makeService().distill(makeInput());
    expect(memoryWriter.write).not.toHaveBeenCalled();
  });

  test("accepts json wrapped in code fences", async () => {
    llmService.complete.mockResolvedValue(
      "```json\n" + JSON.stringify([{ scene: "s", memories: [{ content: "x", type: "fact", priority: 50 }] }]) + "\n```",
    );
    await makeService().distill(makeInput());
    expect(memoryWriter.write).toHaveBeenCalledTimes(1);
  });

  test("warns and records nothing when the LLM call rejects", async () => {
    llmService.complete.mockRejectedValue(new Error("boom"));
    await expect(makeService().distill(makeInput())).resolves.toBeUndefined();
    expect(memoryWriter.write).not.toHaveBeenCalled();
  });
});
