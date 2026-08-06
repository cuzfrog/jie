import type { SettingsStore } from "../config";
import type { MemoryAtom, MemoryStore } from "../memory";
import { createMemorySearchTool } from "./memory-search";
import { makeEmptyContext } from "./_test-context";

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(() => ({})),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
});

function atom(overrides: Partial<MemoryAtom> = {}): MemoryAtom {
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
    memoryStore.search.mockReturnValue([atom()]);
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    const result = await tool.execute({ query: "sqlite" }, makeEmptyContext());
    expect(memoryStore.search).toHaveBeenCalledWith("sqlite", "test-team", 5);
    expect(result.content).toBe("- [decision] sqlite over postgres (scene: store choice, session: s1, 2026-01-01)");
  });

  test("passes the provided limit through", async () => {
    memoryStore.search.mockReturnValue([]);
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    await tool.execute({ query: "sqlite", limit: 20 }, makeEmptyContext());
    expect(memoryStore.search).toHaveBeenCalledWith("sqlite", "test-team", 20);
  });

  test("no matches returns 'no matching memories'", async () => {
    memoryStore.search.mockReturnValue([]);
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    const result = await tool.execute({ query: "nothing" }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
  });

  test("an empty or blank query returns 'no matching memories' without searching", async () => {
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    const result = await tool.execute({ query: "   " }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
    expect(memoryStore.search).not.toHaveBeenCalled();
  });

  test("a malformed FTS query degrades to 'no matching memories'", async () => {
    memoryStore.search.mockImplementation(() => {
      throw new Error("fts5: syntax error near \"?\"");
    });
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    const result = await tool.execute({ query: "what is the auth module?" }, makeEmptyContext());
    expect(result.content).toBe("no matching memories");
  });

  test("memory disabled says so without searching", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    const tool = createMemorySearchTool({ memoryStore, settingsStore });
    const result = await tool.execute({ query: "sqlite" }, makeEmptyContext());
    expect(result.content).toBe("long-term memory is disabled");
    expect(memoryStore.search).not.toHaveBeenCalled();
  });
});