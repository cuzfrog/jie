import { type ExpectationStore } from "./expectation-store.ts";
import { type ChatCompletionRequestBody, type Expectation, type RecordedCall } from "./expectations.ts";
import { MockLlmServerImpl } from "./mock-llm-server.ts";

const store = vi.mocked<ExpectationStore>({
  register: vi.fn(),
  clear: vi.fn(),
  selectAndRecord: vi.fn(),
  calls: vi.fn(),
  expectationCount: vi.fn(),
});

describe("MockLlmServerImpl", () => {
  let server: MockLlmServerImpl;
  let baseUrl: string;

  beforeEach(() => {
    store.calls.mockReturnValue([]);
    store.expectationCount.mockReturnValue(0);
    server = new MockLlmServerImpl(store, 0);
    baseUrl = `http://localhost:${server.port}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  test("GET /health responds ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /mock/calls returns the store call log", async () => {
    const calls: RecordedCall[] = [{ expectationIndex: 0, model: "mock-model", lastUserText: "hi" }];
    store.calls.mockReturnValue(calls);
    const res = await fetch(`${baseUrl}/mock/calls`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calls });
  });

  test("POST /mock/expectations registers the parsed list", async () => {
    const rules: Expectation[] = [
      { match: { lastUserContains: "A" }, responseChunks: [{ kind: "text", delta: "a" }, { kind: "finish", reason: "stop" }] },
      { match: { lastUserContains: "B" }, responseChunks: [{ kind: "text", delta: "b" }, { kind: "finish", reason: "stop" }] },
    ];
    const res = await fetch(`${baseUrl}/mock/expectations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectations: rules }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registered: 2 });
    expect(store.register).toHaveBeenCalledWith(rules);
  });

  test("POST /mock/expectations rejects an invalid JSON body with 400", async () => {
    const res = await fetch(`${baseUrl}/mock/expectations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    expect(store.register).not.toHaveBeenCalled();
  });

  test("POST /mock/expectations rejects a body without an expectations array with 400", async () => {
    const res = await fetch(`${baseUrl}/mock/expectations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });
    expect(res.status).toBe(400);
    expect(store.register).not.toHaveBeenCalled();
  });

  test("DELETE /mock/expectations clears the store", async () => {
    const res = await fetch(`${baseUrl}/mock/expectations`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: true });
    expect(store.clear).toHaveBeenCalled();
  });

  test("POST /v1/chat/completions responds 500 mock_no_match when nothing matches", async () => {
    store.selectAndRecord.mockReturnValue(undefined);
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chatRequest("anything")),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { message: "no expectation matched", type: "mock_no_match", param: null, code: null } });
  });

  test("POST /v1/chat/completions streams a matched expectation", async () => {
    const expectation: Expectation = {
      match: { lastUserContains: "hi" },
      responseChunks: [{ kind: "text", delta: "ok" }, { kind: "finish", reason: "stop" }],
    };
    store.selectAndRecord.mockReturnValue({ index: 0, expectation });
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chatRequest("hi there")),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
    expect(store.selectAndRecord).toHaveBeenCalledWith(chatRequest("hi there"));
  });

  test("unknown path responds 404", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});

function chatRequest(content: string): ChatCompletionRequestBody {
  return { model: "mock-model", stream: true, messages: [{ role: "user", content }] };
}
