import { SqliteStorage } from "../storage";
import { SqliteMemoryStore, type NewMemoryAtom } from "./memory-store";

function makeStore(): SqliteMemoryStore {
  return new SqliteMemoryStore(new SqliteStorage(":memory:"));
}

function atom(overrides: Partial<NewMemoryAtom> = {}): NewMemoryAtom {
  return {
    content: "the auth module is still used by mobile",
    type: "fact",
    priority: 80,
    scene: "auth module migration",
    ...overrides,
  };
}

describe("SqliteMemoryStore", () => {
  test("add stores atoms and returns the stored count", () => {
    const store = makeStore();
    const stored = store.add([atom(), atom({ content: "sqlite is embedded", type: "decision", priority: 60 })], "team-a", "s1");
    expect(stored).toBe(2);
  });

  test("add skips atoms with the same content and type within the same team", () => {
    const store = makeStore();
    store.add([atom()], "team-a", "s1");
    const stored = store.add([atom(), atom({ content: "sqlite is embedded" })], "team-a", "s2");
    expect(stored).toBe(1);
  });

  test("add keeps the same content in different teams", () => {
    const store = makeStore();
    store.add([atom()], "team-a", "s1");
    const stored = store.add([atom()], "team-b", "s1");
    expect(stored).toBe(1);
  });

  test("add forces instruction to priority 100 and clamps the range", () => {
    const store = makeStore();
    store.add(
      [
        atom({ type: "instruction", priority: 1 }),
        atom({ content: "low", priority: -5 }),
        atom({ content: "high", priority: 150 }),
        atom({ content: "float", priority: 80.6 }),
      ],
      "team-a",
      "s1",
    );
    const top = store.top("team-a", 10);
    const byContent = new Map(top.map((a) => [a.content, a.priority]));
    expect(byContent.get("the auth module is still used by mobile")).toBe(100);
    expect(byContent.get("low")).toBe(0);
    expect(byContent.get("high")).toBe(100);
    expect(byContent.get("float")).toBe(81);
  });

  test("top orders by priority desc then updated_at desc", async () => {
    const store = makeStore();
    store.add([atom({ content: "c1", priority: 50 })], "team-a", "s1");
    await new Promise((r) => setTimeout(r, 3));
    store.add([atom({ content: "c2", priority: 90 })], "team-a", "s1");
    await new Promise((r) => setTimeout(r, 3));
    store.add([atom({ content: "c3", priority: 50 })], "team-a", "s1");
    const top = store.top("team-a", 10);
    expect(top.map((a) => a.content)).toEqual(["c2", "c3", "c1"]);
  });

  test("top is scoped to the team and respects the limit", () => {
    const store = makeStore();
    store.add([atom({ content: "team-a only" })], "team-a", "s1");
    store.add([atom({ content: "team-b only" })], "team-b", "s1");
    const top = store.top("team-a", 1);
    expect(top.map((a) => a.content)).toEqual(["team-a only"]);
  });

  test("search matches content via FTS and is scoped to the team", () => {
    const store = makeStore();
    store.add([atom({ content: "sqlite is embedded and dependable" })], "team-a", "s1");
    store.add([atom({ content: "sqlite migrations are slow" })], "team-b", "s1");
    const hits = store.search("sqlite", "team-a", 10);
    expect(hits.map((a) => a.content)).toEqual(["sqlite is embedded and dependable"]);
  });

  test("search returns no hits for a missing term", () => {
    const store = makeStore();
    store.add([atom()], "team-a", "s1");
    const hits = store.search("postgres", "team-a", 10);
    expect(hits).toEqual([]);
  });
});