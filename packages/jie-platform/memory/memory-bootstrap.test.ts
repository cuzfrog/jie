import type { SettingsStore } from "../config";
import { formatMemoryBootstrap, loadMemoryBootstrap } from "./memory-bootstrap";
import type { MemoryAtom, MemoryStore } from "./memory-store";

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });
const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
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

beforeEach(() => {
  settingsStore.load.mockReturnValue({});
  memoryStore.top.mockResolvedValue([atom()]);
});

describe("loadMemoryBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the top atoms into the memory block", async () => {
    memoryStore.top.mockResolvedValue([
      atom({ content: "stand on two feet" }),
      atom({ content: "sqlite over postgres", type: "decision", priority: 90, scene: "store choice" }),
    ]);
    const block = await loadMemoryBootstrap(memoryStore, settingsStore, "t1");
    expect(block).toBe(
      "<memory team=\"t1\">\n" +
      "- [instruction] stand on two feet\n" +
      "- [decision] sqlite over postgres (scene: store choice)\n" +
      "</memory>",
    );
    expect(memoryStore.top).toHaveBeenCalledWith("t1", 12);
  });

  test("returns an empty block when memory is disabled", async () => {
    settingsStore.load.mockReturnValue({ memory: { enabled: false } });
    expect(await loadMemoryBootstrap(memoryStore, settingsStore, "t1")).toBe("");
    expect(memoryStore.top).not.toHaveBeenCalled();
  });

  test("applies the bootstrapMaxEntries and bootstrapMaxChars overrides", async () => {
    settingsStore.load.mockReturnValue({ memory: { bootstrapMaxEntries: 3, bootstrapMaxChars: 100 } });
    await loadMemoryBootstrap(memoryStore, settingsStore, "t1");
    expect(memoryStore.top).toHaveBeenCalledWith("t1", 3);
  });

  test("degrades to an empty block when the store load fails", async () => {
    memoryStore.top.mockRejectedValue(new Error("db locked"));
    expect(await loadMemoryBootstrap(memoryStore, settingsStore, "t1")).toBe("");
  });

  test("degrades to an empty block when the store load times out", async () => {
    memoryStore.top.mockReturnValue(new Promise<ReadonlyArray<MemoryAtom>>(() => {}));
    const promise = loadMemoryBootstrap(memoryStore, settingsStore, "t1");
    vi.advanceTimersByTime(5000);
    expect(await promise).toBe("");
  });
});

describe("formatMemoryBootstrap", () => {
  test("drops the lowest-value entries until the block fits maxChars", () => {
    const atoms = [
      atom({ content: "instruction atom that is quite long", type: "instruction" }),
      atom({ content: "expansion", type: "fact", priority: 10 }),
    ];
    const block = formatMemoryBootstrap(atoms, "t1", 90);
    expect(block).toContain("instruction atom");
    expect(block).not.toContain("expansion");
  });

  test("omits the scene suffix for instruction atoms", () => {
    const block = formatMemoryBootstrap([atom({ content: "pin it", type: "instruction", scene: "ci" })], "t1", 2000);
    expect(block).not.toContain("scene:");
  });

  test("returns an empty string when no atom fits", () => {
    expect(formatMemoryBootstrap([atom({ content: "x".repeat(500) })], "t1", 10)).toBe("");
  });
});