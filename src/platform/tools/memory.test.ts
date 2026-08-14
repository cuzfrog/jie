import type { SettingsStore } from "../config";
import type { Memory, MemoryManager } from "../memory";
import { createMemoryTool } from "./memory";
import { makeEmptyContext } from "./_test-context";

const memoryManager = vi.mocked<MemoryManager>({ add: vi.fn(), search: vi.fn(), bootstrap: vi.fn(() => ""), distill: vi.fn(async () => {}) });

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(() => ({})),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "a1",
    teamId: "t1",
    content: "sqlite over postgres",
    type: "decision",
    priority: 90,
    scene: "store choice",
    sourceSessionId: "s1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contextWithToolArgs(args: ReadonlyArray<string>) {
  const context = makeEmptyContext();
  return { ...context, toolArgs: new Map([["memory", args]]) };
}

describe("memory", () => {
  test("add stores a new memory with the default priority and scene", async () => {
    memoryManager.add.mockReturnValue(1);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const result = await tool.execute({ op: "add", content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(memoryManager.add).toHaveBeenCalledWith(
      [{ content: "use sqlite", type: "fact", priority: 50, scene: "manual" }],
      "test-team",
      "test-session",
    );
    expect(result.content).toBe("stored 1 new memory: [fact] use sqlite");
  });

  test("add reinforces an existing memory when the store returns 0", async () => {
    memoryManager.add.mockReturnValue(0);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const result = await tool.execute({ op: "add", content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(result.content).toBe("reinforced existing memory: [fact] use sqlite");
  });

  test("add passes explicit priority and scene through", async () => {
    memoryManager.add.mockReturnValue(1);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    await tool.execute({ op: "add", content: "keep the build green", type: "instruction", priority: 100, scene: "ci" }, makeEmptyContext());
    expect(memoryManager.add).toHaveBeenCalledWith(
      [{ content: "keep the build green", type: "instruction", priority: 100, scene: "ci" }],
      "test-team",
      "test-session",
    );
  });

  test("add without content or type throws INVALID_TOOL_ARGS", async () => {
    const tool = createMemoryTool({ memoryManager, settingsStore });
    await expect(tool.execute({ op: "add", content: "c" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
    await expect(tool.execute({ op: "add", type: "fact" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
  });

  test("a failing add returns the error message", async () => {
    memoryManager.add.mockImplementation(() => {
      throw new Error("memory content must not be empty");
    });
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const result = await tool.execute({ op: "add", content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(result.content).toBe("failed to add memory: memory content must not be empty");
  });

  test("search queries the team pool with the default limit of 5", async () => {
    memoryManager.search.mockReturnValue([memory()]);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const result = await tool.execute({ op: "search", query: "sqlite" }, makeEmptyContext());
    expect(memoryManager.search).toHaveBeenCalledWith("sqlite", "test-team", 5);
    expect(result.content).toBe("- [decision] sqlite over postgres (scene: store choice, session: s1, 2026-01-01)");
  });

  test("search passes the provided limit through", async () => {
    memoryManager.search.mockReturnValue([]);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    await tool.execute({ op: "search", query: "sqlite", limit: 20 }, makeEmptyContext());
    expect(memoryManager.search).toHaveBeenCalledWith("sqlite", "test-team", 20);
  });

  test("search without query throws INVALID_TOOL_ARGS", async () => {
    const tool = createMemoryTool({ memoryManager, settingsStore });
    await expect(tool.execute({ op: "search" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
  });

  test("search with no matches returns 'no matching memories'", async () => {
    memoryManager.search.mockReturnValue([]);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const result = await tool.execute({ op: "search", query: "nothing" }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
  });

  test("memory disabled says so without touching the manager", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    const tool = createMemoryTool({ memoryManager, settingsStore });
    const addResult = await tool.execute({ op: "add", content: "use sqlite", type: "fact" }, makeEmptyContext());
    const searchResult = await tool.execute({ op: "search", query: "sqlite" }, makeEmptyContext());
    expect(addResult.content).toBe("long-term memory is disabled");
    expect(searchResult.content).toBe("long-term memory is disabled");
    expect(memoryManager.add).not.toHaveBeenCalled();
    expect(memoryManager.search).not.toHaveBeenCalled();
  });

  test("ops outside the manifest allowlist are rejected with TOOL_OP_DENIED", async () => {
    settingsStore.load.mockReturnValue({});
    memoryManager.add.mockReturnValue(1);
    const tool = createMemoryTool({ memoryManager, settingsStore });
    await expect(tool.execute({ op: "add", content: "c", type: "fact" }, contextWithToolArgs(["search"]))).rejects.toMatchObject({ code: "TOOL_OP_DENIED" });
    memoryManager.search.mockReturnValue([]);
    await expect(tool.execute({ op: "search", query: "q" }, contextWithToolArgs(["search"]))).resolves.toBeDefined();
  });
});
