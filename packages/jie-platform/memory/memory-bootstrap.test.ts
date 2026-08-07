import type { SettingsStore } from "../config";
import { MemoryBootstrapImpl, type MemoryBootstrap } from "./memory-bootstrap";
import type { MemoryAtom, MemoryStore } from "./memory-store";

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });
const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
});

function atom(overrides: Partial<MemoryAtom> = {}): MemoryAtom {
  return {
    id: "a1",
    teamId: "t1",
    content: "keep the build green",
    type: "instruction",
    priority: 100,
    scene: "",
    sourceSessionId: "s1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeBootstrap(): MemoryBootstrap {
  return new MemoryBootstrapImpl(memoryStore, settingsStore);
}

beforeEach(() => {
  settingsStore.load.mockReturnValue({});
  memoryStore.top.mockReturnValue([]);
});

describe("MemoryBootstrapImpl", () => {
  test("renders the top atoms into the memory block", () => {
    memoryStore.top.mockReturnValue([
      atom({ content: "stand on two feet" }),
      atom({ content: "sqlite over postgres", type: "decision", priority: 90, scene: "store choice" }),
    ]);
    const block = makeBootstrap().render("t1");
    expect(block).toBe(
      "<memory team=\"t1\">\n" +
        "- [instruction] stand on two feet\n" +
        "- [decision] sqlite over postgres (scene: store choice)\n" +
        "</memory>",
    );
    expect(memoryStore.top).toHaveBeenCalledWith("t1", 12);
  });

  test("returns an empty block when memory is disabled", () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    expect(makeBootstrap().render("t1")).toBe("");
    expect(memoryStore.top).not.toHaveBeenCalled();
  });

  test("applies the bootstrapMaxEntries and bootstrapMaxChars overrides", () => {
    settingsStore.load.mockReturnValue({ memory: { bootstrapMaxEntries: 3, bootstrapMaxChars: 100 } });
    makeBootstrap().render("t1");
    expect(memoryStore.top).toHaveBeenCalledWith("t1", 3);
  });

  test("degrades to an empty block when the store load fails", () => {
    memoryStore.top.mockImplementation(() => {
      throw new Error("db locked");
    });
    expect(makeBootstrap().render("t1")).toBe("");
  });

  test("drops the lowest-value entries until the block fits maxChars", () => {
    settingsStore.load.mockReturnValue({ memory: { bootstrapMaxChars: 90 } });
    memoryStore.top.mockReturnValue([
      atom({ content: "instruction atom that is quite long", type: "instruction" }),
      atom({ content: "expansion", type: "fact", priority: 10 }),
    ]);
    const block = makeBootstrap().render("t1");
    expect(block).toContain("instruction atom");
    expect(block).not.toContain("expansion");
  });

  test("omits the scene suffix for instruction atoms", () => {
    memoryStore.top.mockReturnValue([atom({ content: "pin it", type: "instruction", scene: "ci" })]);
    const block = makeBootstrap().render("t1");
    expect(block).not.toContain("scene:");
  });

  test("returns an empty string when no atom fits", () => {
    memoryStore.top.mockReturnValue([atom({ content: "x".repeat(500) })]);
    settingsStore.load.mockReturnValue({ memory: { bootstrapMaxChars: 10 } });
    expect(makeBootstrap().render("t1")).toBe("");
  });
});
