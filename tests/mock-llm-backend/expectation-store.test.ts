import { ExpectationStoreImpl } from "./expectation-store.ts";
import { type ChatCompletionRequestBody, type Expectation } from "./expectations.ts";

const ruleA: Expectation = { match: { lastUserContains: "A" }, responseChunks: [{ kind: "text", delta: "a" }, { kind: "finish", reason: "stop" }] };
const ruleB: Expectation = { match: { lastUserContains: "B" }, responseChunks: [{ kind: "text", delta: "b" }, { kind: "finish", reason: "stop" }] };

function chatRequest(content: string, model = "mock-model"): ChatCompletionRequestBody {
  return { model, stream: true, messages: [{ role: "user", content }] };
}

describe("ExpectationStoreImpl", () => {
  test("selectAndRecord with no expectations records a -1 call and returns undefined", () => {
    const store = new ExpectationStoreImpl();
    expect(store.selectAndRecord(chatRequest("anything"))).toBeUndefined();
    const calls = store.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.expectationIndex).toBe(-1);
    expect(calls[0]?.model).toBe("mock-model");
    expect(calls[0]?.lastUserText).toBe("anything");
  });

  test("selectAndRecord returns the first matching expectation by index and records it", () => {
    const store = new ExpectationStoreImpl();
    store.register([ruleA, ruleB]);
    const picked = store.selectAndRecord(chatRequest("hello B"));
    expect(picked?.index).toBe(1);
    expect(picked?.expectation).toBe(ruleB);
    expect(store.calls()[0]?.expectationIndex).toBe(1);
  });

  test("register replaces expectations and clears the call log", () => {
    const store = new ExpectationStoreImpl();
    store.register([ruleA]);
    store.selectAndRecord(chatRequest("A"));
    expect(store.calls()).toHaveLength(1);
    store.register([ruleB]);
    expect(store.calls()).toHaveLength(0);
    expect(store.selectAndRecord(chatRequest("A"))).toBeUndefined();
    expect(store.selectAndRecord(chatRequest("B"))?.index).toBe(0);
  });

  test("clear empties expectations and the call log", () => {
    const store = new ExpectationStoreImpl();
    store.register([ruleA]);
    store.selectAndRecord(chatRequest("A"));
    store.clear();
    expect(store.expectationCount()).toBe(0);
    expect(store.calls()).toHaveLength(0);
    expect(store.selectAndRecord(chatRequest("A"))).toBeUndefined();
  });

  test("expectationCount reflects registered expectations", () => {
    const store = new ExpectationStoreImpl();
    expect(store.expectationCount()).toBe(0);
    store.register([ruleA, ruleB]);
    expect(store.expectationCount()).toBe(2);
  });
});
