import { startMockServer } from "./server.ts";
import { type Expectation, type RecordedCall } from "./expectations.ts";

interface SseRecord {
  data: string;
}

function parseSse(body: string): SseRecord[] {
  const records: SseRecord[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.replace(/^\n+|\n+$/g, "");
    if (trimmed === "") continue;
    if (!trimmed.startsWith("data: ")) continue;
    const data = trimmed.slice("data: ".length);
    if (data === "[DONE]") continue;
    records.push({ data });
  }
  return records;
}

async function streamToString(res: Response): Promise<string> {
  if (res.body === null) throw new Error("response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) acc += decoder.decode(value, { stream: true });
  }
  acc += decoder.decode();
  return acc;
}

interface Harness {
  baseUrl: string;
  register(rules: Expectation[]): Promise<void>;
  calls(): Promise<RecordedCall[]>;
  stop(): Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const server = await startMockServer(0);
  const baseUrl = `http://localhost:${server.port}`;
  return {
    baseUrl,
    register: async (rules) => {
      const res = await fetch(`${baseUrl}/mock/expectations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectations: rules }),
      });
      if (res.status !== 200) throw new Error(`register failed: ${res.status}`);
    },
    calls: async () => {
      const res = await fetch(`${baseUrl}/mock/calls`);
      const body = (await res.json()) as { calls: RecordedCall[] };
      return body.calls;
    },
    stop: () => server.stop(),
  };
}

describe("mock-llm-backend server", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });

  afterEach(async () => {
    await h.stop();
  });

  test("health endpoint is the liveness probe", async () => {
    const res = await fetch(`${h.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("POST /v1/chat/completions streams matching text expectations", async () => {
    await h.register([
      { match: { lastUserContains: "hello" }, responseChunks: [{ kind: "text", delta: "world" }, { kind: "finish", reason: "stop" }] },
    ]);
    const res = await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock-model",
        stream: true,
        messages: [{ role: "user", content: "hello there" }],
      }),
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await streamToString(res);
    const records = parseSse(body);
    expect(records.length).toBeGreaterThan(0);
    expect(body).toContain("data: [DONE]");
    expect(body).toContain('"content":"world"');
    const last = JSON.parse(records[records.length - 1]!.data);
    expect(last.choices[0].finish_reason).toBe("stop");
  });

  test("tool_call stream emits name first then per-token arguments", async () => {
    await h.register([
      {
        match: { toolName: "bash" },
        responseChunks: [
          { kind: "tool_call", id: "call_99", name: "bash", argumentsChunks: ["PARTA", "PARTB"] },
          { kind: "finish", reason: "tool_calls" },
        ],
      },
    ]);
    const res = await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock-model",
        stream: true,
        messages: [{ role: "user", content: "run a command" }],
        tools: [{ type: "function", function: { name: "bash" } }],
      }),
    });
    const body = await streamToString(res);
    expect(body).toContain('"name":"bash"');
    expect(body).toContain('"id":"call_99"');
    expect(body).toContain('"arguments":"PARTA"');
    expect(body).toContain('"arguments":"PARTB"');
    expect(body).toContain('"finish_reason":"tool_calls"');
  });

  test("no matching expectation returns HTTP 500 with an OpenAI-style envelope", async () => {
    const res = await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock-model",
        stream: true,
        messages: [{ role: "user", content: "anything" }],
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string; type: string } };
    expect(body.error.message).toBe("no expectation matched");
    expect(body.error.type).toBe("mock_no_match");

    const calls = await h.calls();
    expect(calls.length).toBe(1);
    expect(calls[0]!.expectationIndex).toBe(-1);
  });

  test("matched call is recorded in /mock/calls with expectation index", async () => {
    await h.register([
      { match: { lastUserContains: "A" }, responseChunks: [{ kind: "text", delta: "ok" }, { kind: "finish", reason: "stop" }] },
      { match: { lastUserContains: "B" }, responseChunks: [{ kind: "text", delta: "ok" }, { kind: "finish", reason: "stop" }] },
    ]);
    await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "B" }] }),
    });
    const calls = await h.calls();
    expect(calls.length).toBe(1);
    expect(calls[0]!.expectationIndex).toBe(1);
    expect(calls[0]!.lastUserText).toBe("B");
  });

  test("DELETE /mock/expectations clears rules and call log", async () => {
    await h.register([
      { match: {}, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] },
    ]);
    await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "x" }] }),
    });
    expect((await h.calls()).length).toBe(1);

    const del = await fetch(`${h.baseUrl}/mock/expectations`, { method: "DELETE" });
    expect(del.status).toBe(200);

    expect((await h.calls()).length).toBe(0);

    const res = await fetch(`${h.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "x" }] }),
    });
    expect(res.status).toBe(500);
  });
});
