import { SqliteStorage } from "./sqlite-storage";
import { SqliteSessionUsageStore } from "./session-usage-store";

function makeStore(): SqliteSessionUsageStore {
  return new SqliteSessionUsageStore(new SqliteStorage(":memory:"));
}

describe("SqliteSessionUsageStore", () => {
  test("load returns null for an unknown key", () => {
    const store = makeStore();
    expect(store.load("t1", "s1", "general-1")).toBeNull();
  });

  test("accumulate inserts a fresh row", () => {
    const store = makeStore();
    store.accumulate("t1", "s1", "general-1", { inputTokens: 10, outputTokens: 5 });
    expect(store.load("t1", "s1", "general-1")).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  test("accumulate increments an existing row", () => {
    const store = makeStore();
    store.accumulate("t1", "s1", "general-1", { inputTokens: 10, outputTokens: 5 });
    store.accumulate("t1", "s1", "general-1", { inputTokens: 3, outputTokens: 7 });
    expect(store.load("t1", "s1", "general-1")).toEqual({ inputTokens: 13, outputTokens: 12 });
  });

  test("rows are isolated by team, session, and agent", () => {
    const store = makeStore();
    store.accumulate("t1", "s1", "general-1", { inputTokens: 1, outputTokens: 1 });
    store.accumulate("t1", "s1", "worker-1", { inputTokens: 2, outputTokens: 2 });
    store.accumulate("t1", "s2", "general-1", { inputTokens: 3, outputTokens: 3 });
    store.accumulate("t2", "s1", "general-1", { inputTokens: 4, outputTokens: 4 });
    expect(store.load("t1", "s1", "general-1")).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect(store.load("t1", "s1", "worker-1")).toEqual({ inputTokens: 2, outputTokens: 2 });
    expect(store.load("t1", "s2", "general-1")).toEqual({ inputTokens: 3, outputTokens: 3 });
    expect(store.load("t2", "s1", "general-1")).toEqual({ inputTokens: 4, outputTokens: 4 });
  });
});
