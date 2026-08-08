import { MemoryWriterImpl, type MemoryWriter } from "./memory-writer";
import type { MemoryStore, RawMemory } from "./memory-store";

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });

function makeWriter(): MemoryWriter {
  return new MemoryWriterImpl(memoryStore);
}

function makeRawMemory(overrides: Partial<RawMemory> = {}): RawMemory {
  return { content: "use sqlite", type: "fact", priority: 80, scene: "storage", ...overrides };
}

beforeEach(() => {
  memoryStore.add.mockReturnValue(0);
});

describe("MemoryWriterImpl", () => {
  test("write stores valid memories and returns the store count", () => {
    const memories = [makeRawMemory()];
    memoryStore.add.mockReturnValue(1);
    expect(makeWriter().write(memories, "t1", "s1")).toBe(1);
    expect(memoryStore.add).toHaveBeenCalledWith(memories, "t1", "s1");
  });

  test("write rejects empty content", () => {
    const memories = [makeRawMemory({ content: "" })];
    expect(() => makeWriter().write(memories, "t1", "s1")).toThrow("memory content must not be empty");
    expect(memoryStore.add).not.toHaveBeenCalled();
  });

  test("write rejects blank content", () => {
    const memories = [makeRawMemory({ content: "   " })];
    expect(() => makeWriter().write(memories, "t1", "s1")).toThrow("memory content must not be empty");
  });

  test("write rejects empty scene", () => {
    const memories = [makeRawMemory({ scene: "" })];
    expect(() => makeWriter().write(memories, "t1", "s1")).toThrow("memory scene must not be empty");
  });

  test("write rejects invalid type", () => {
    const memories = [makeRawMemory({ type: "bogus" as "fact" })];
    expect(() => makeWriter().write(memories, "t1", "s1")).toThrow("invalid memory type: bogus");
  });

  test("write rejects non-finite priority", () => {
    const memories = [makeRawMemory({ priority: NaN })];
    expect(() => makeWriter().write(memories, "t1", "s1")).toThrow("memory priority must be a finite number");
  });
});
