import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { MemoryManagerImpl, type MemoryManager } from "./memory-manager";
import type { MemoryBootstrap } from "./memory-bootstrap";
import type { MemoryDistiller, DistillationInput } from "./memory-distiller";
import type { Memory, MemoryStore } from "./memory-store";
import type { MemoryWriter } from "./memory-writer";

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });
const memoryWriter = vi.mocked<MemoryWriter>({ write: vi.fn() });
const memoryDistiller = vi.mocked<MemoryDistiller>({ distill: vi.fn(async () => {}) });
const memoryBootstrap = vi.mocked<MemoryBootstrap>({ render: vi.fn(() => "") });

function makeManager(): MemoryManager {
  return new MemoryManagerImpl(memoryWriter, memoryStore, memoryDistiller, memoryBootstrap);
}

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

beforeEach(() => {
  memoryStore.search.mockReturnValue([]);
  memoryStore.top.mockReturnValue([]);
  memoryBootstrap.render.mockReturnValue("");
  memoryWriter.write.mockReturnValue(0);
});

describe("MemoryManagerImpl", () => {
  test("add forwards to the writer and returns the stored count", () => {
    const memories = [{ content: "use sqlite", type: "fact" as const, priority: 80, scene: "storage" }];
    memoryWriter.write.mockReturnValue(1);
    const manager = makeManager();
    expect(manager.add(memories, "t1", "s1")).toBe(1);
    expect(memoryWriter.write).toHaveBeenCalledWith(memories, "t1", "s1");
  });

  test("search forwards to the store and returns its result", () => {
    const results: Memory[] = [{
      id: "a1",
      teamId: "t1",
      content: "sqlite over postgres",
      type: "decision",
      priority: 90,
      scene: "store choice",
      sourceSessionId: "s1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }];
    memoryStore.search.mockReturnValue(results);
    const manager = makeManager();
    expect(manager.search("sqlite", "t1", 5)).toBe(results);
    expect(memoryStore.search).toHaveBeenCalledWith("sqlite", "t1", 5);
  });

  test("bootstrap forwards to the bootstrap renderer and returns its result", () => {
    memoryBootstrap.render.mockReturnValue("<memory team=\"t1\">\n- [instruction] keep the build green\n</memory>");
    const manager = makeManager();
    expect(manager.bootstrap("t1")).toBe("<memory team=\"t1\">\n- [instruction] keep the build green\n</memory>");
    expect(memoryBootstrap.render).toHaveBeenCalledWith("t1");
  });

  test("distill forwards to the distiller and returns its promise", async () => {
    const model = makeModel("m");
    const messages: ReadonlyArray<AgentMessage> = [];
    const input: DistillationInput = { messages, teamId: "t1", sessionId: "s1", model };
    await makeManager().distill(input);
    expect(memoryDistiller.distill).toHaveBeenCalledWith(input);
  });
});
