import { SqliteStorage } from "../storage";
import { SqliteMemoryStore, type RawMemory } from "./memory-store";

function makeStore(): SqliteMemoryStore {
  return new SqliteMemoryStore(new SqliteStorage(":memory:"));
}

function memory(overrides: Partial<RawMemory> = {}): RawMemory {
  return {
    content: "the auth module is still used by mobile",
    type: "fact",
    priority: 80,
    scene: "auth module migration",
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SqliteMemoryStore", () => {
  test("add stores memories and returns the stored count", () => {
    const store = makeStore();
    const stored = store.add([memory(), memory({ content: "sqlite is embedded", type: "decision", priority: 60 })], "team-a", "s1");
    expect(stored).toBe(2);
  });

  test("add reinforces an existing memory with the same content and type within the same team", async () => {
    const store = makeStore();
    expect(store.add([memory()], "team-a", "s1")).toBe(1);
    await sleep(3);
    expect(store.add([memory({ priority: 50 })], "team-a", "s2")).toBe(0);
    const top = store.top("team-a", 10);
    expect(top).toHaveLength(1);
    expect(top[0]!.priority).toBe(80);
    expect(top[0]!.sourceSessionId).toBe("s1");
    expect(top[0]!.updatedAt > top[0]!.createdAt).toBe(true);
  });

  test("add takes the higher priority and latest scene when reinforcing", async () => {
    const store = makeStore();
    store.add([memory({ scene: "initial", priority: 50 })], "team-a", "s1");
    await sleep(3);
    store.add([memory({ scene: "latest", priority: 90 })], "team-a", "s2");
    const top = store.top("team-a", 10);
    expect(top[0]!.priority).toBe(90);
    expect(top[0]!.scene).toBe("latest");
  });

  test("add keeps the same content in different teams", () => {
    const store = makeStore();
    expect(store.add([memory()], "team-a", "s1")).toBe(1);
    expect(store.add([memory()], "team-b", "s1")).toBe(1);
    expect(store.top("team-a", 10)).toHaveLength(1);
    expect(store.top("team-b", 10)).toHaveLength(1);
  });

  test("add forces instruction to priority 100 and clamps the range", () => {
    const store = makeStore();
    store.add(
      [
        memory({ type: "instruction", priority: 1 }),
        memory({ content: "low", priority: -5 }),
        memory({ content: "high", priority: 150 }),
        memory({ content: "float", priority: 80.6 }),
      ],
      "team-a",
      "s1",
    );
    const top = store.top("team-a", 10);
    const byContent = new Map(top.map((m) => [m.content, m.priority]));
    expect(byContent.get("the auth module is still used by mobile")).toBe(100);
    expect(byContent.get("low")).toBe(0);
    expect(byContent.get("high")).toBe(100);
    expect(byContent.get("float")).toBe(81);
  });

  test("add clamps a non-finite priority to zero", () => {
    const store = makeStore();
    store.add([memory({ content: "not a number", priority: Number.NaN })], "team-a", "s1");
    expect(store.top("team-a", 10).map((m) => m.priority)).toEqual([0]);
  });

  test("top orders by priority desc then updated_at desc", async () => {
    const store = makeStore();
    store.add([memory({ content: "c1", priority: 50 })], "team-a", "s1");
    await sleep(3);
    store.add([memory({ content: "c2", priority: 90 })], "team-a", "s1");
    await sleep(3);
    store.add([memory({ content: "c3", priority: 50 })], "team-a", "s1");
    const top = store.top("team-a", 10);
    expect(top.map((m) => m.content)).toEqual(["c2", "c3", "c1"]);
  });

  test("top is scoped to the team and respects the limit", () => {
    const store = makeStore();
    store.add([memory({ content: "team-a only" })], "team-a", "s1");
    store.add([memory({ content: "team-b only" })], "team-b", "s1");
    const top = store.top("team-a", 1);
    expect(top.map((m) => m.content)).toEqual(["team-a only"]);
  });

  test("search matches content via FTS and is scoped to the team", () => {
    const store = makeStore();
    store.add([memory({ content: "sqlite is embedded and dependable" })], "team-a", "s1");
    store.add([memory({ content: "sqlite migrations are slow" })], "team-b", "s1");
    const hits = store.search("sqlite", "team-a", 10);
    expect(hits.map((m) => m.content)).toEqual(["sqlite is embedded and dependable"]);
  });

  test("search returns no hits for a missing term", () => {
    const store = makeStore();
    store.add([memory()], "team-a", "s1");
    const hits = store.search("postgres", "team-a", 10);
    expect(hits).toEqual([]);
  });

  test("search handles FTS special characters without throwing", () => {
    const store = makeStore();
    store.add([memory({ content: "sqlite is embedded and dependable" })], "team-a", "s1");
    const hits = store.search('"sqlite (db)*"', "team-a", 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.content).toBe("sqlite is embedded and dependable");
  });

  test("search matches CJK content by substring", () => {
    const store = makeStore();
    store.add([memory({ content: "认证模块仍在移动端使用" })], "team-a", "s1");
    const hits = store.search("认证模块", "team-a", 10);
    expect(hits.map((m) => m.content)).toEqual(["认证模块仍在移动端使用"]);
  });

  test("search returns no hits for an empty or whitespace-only query", () => {
    const store = makeStore();
    store.add([memory()], "team-a", "s1");
    expect(store.search("", "team-a", 10)).toEqual([]);
    expect(store.search("   ", "team-a", 10)).toEqual([]);
  });
});
