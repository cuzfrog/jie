import type { SettingsStore } from "../config";
import type { Memory, MemoryManager } from "../memory";
import { createMemorySearchTool } from "./memory-search";
import { makeEmptyContext } from "./_test-context";

const memoryManager = vi.mocked<MemoryManager>({ add: vi.fn(), search: vi.fn(), bootstrap: vi.fn(() => ""), distill: vi.fn(async () => {}) });

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(() => ({})),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
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

describe("memory_search", () => {
  test("searches the execution context's team pool with the default limit of 5", async () => {
    memoryManager.search.mockReturnValue([memory()]);
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    const result = await tool.execute({ query: "sqlite" }, makeEmptyContext());
    expect(memoryManager.search).toHaveBeenCalledWith("sqlite", "test-team", 5);
    expect(result.content).toBe("- [decision] sqlite over postgres (scene: store choice, session: s1, 2026-01-01)");
  });

  test("passes the provided limit through", async () => {
    memoryManager.search.mockReturnValue([]);
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    await tool.execute({ query: "sqlite", limit: 20 }, makeEmptyContext());
    expect(memoryManager.search).toHaveBeenCalledWith("sqlite", "test-team", 20);
  });

  test("no matches returns 'no matching memories'", async () => {
    memoryManager.search.mockReturnValue([]);
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    const result = await tool.execute({ query: "nothing" }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
  });

  test("an empty or blank query returns 'no matching memories' without searching", async () => {
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    const result = await tool.execute({ query: "   " }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
    expect(memoryManager.search).not.toHaveBeenCalled();
  });

  test("a malformed FTS query degrades to 'no matching memories'", async () => {
    memoryManager.search.mockImplementation(() => {
      throw new Error("fts5: syntax error near \"?\"");
    });
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    const result = await tool.execute({ query: "what is the auth module?" }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
  });

  test("memory disabled says so without searching", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    const tool = createMemorySearchTool({ memoryManager, settingsStore });
    const result = await tool.execute({ query: "sqlite" }, makeEmptyContext());
    expect(result.content).toBe("long-term memory is disabled");
    expect(memoryManager.search).not.toHaveBeenCalled();
  });
});
