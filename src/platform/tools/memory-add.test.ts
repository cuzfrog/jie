import type { SettingsStore } from "../config";
import type { MemoryManager } from "../memory";
import { createMemoryAddTool } from "./memory-add";
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

describe("memory_add", () => {
  test("stores a new memory with the default priority and scene", async () => {
    memoryManager.add.mockReturnValue(1);
    const tool = createMemoryAddTool({ memoryManager, settingsStore });
    const result = await tool.execute({ content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(memoryManager.add).toHaveBeenCalledWith(
      [{ content: "use sqlite", type: "fact", priority: 50, scene: "manual" }],
      "test-team",
      "test-session",
    );
    expect(result.content).toBe("stored 1 new memory: [fact] use sqlite");
  });

  test("reinforces an existing memory when the store returns 0", async () => {
    memoryManager.add.mockReturnValue(0);
    const tool = createMemoryAddTool({ memoryManager, settingsStore });
    const result = await tool.execute({ content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(result.content).toBe("reinforced existing memory: [fact] use sqlite");
  });

  test("passes explicit priority and scene through", async () => {
    memoryManager.add.mockReturnValue(1);
    const tool = createMemoryAddTool({ memoryManager, settingsStore });
    await tool.execute({ content: "keep the build green", type: "instruction", priority: 100, scene: "ci" }, makeEmptyContext());
    expect(memoryManager.add).toHaveBeenCalledWith(
      [{ content: "keep the build green", type: "instruction", priority: 100, scene: "ci" }],
      "test-team",
      "test-session",
    );
  });

  test("memory disabled says so without calling add", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    const tool = createMemoryAddTool({ memoryManager, settingsStore });
    const result = await tool.execute({ content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(result.content).toBe("long-term memory is disabled");
    expect(memoryManager.add).not.toHaveBeenCalled();
  });

  test("a failing add returns the error message", async () => {
    memoryManager.add.mockImplementation(() => {
      throw new Error("memory content must not be empty");
    });
    const tool = createMemoryAddTool({ memoryManager, settingsStore });
    const result = await tool.execute({ content: "use sqlite", type: "fact" }, makeEmptyContext());
    expect(result.content).toBe("failed to add memory: memory content must not be empty");
  });
});
