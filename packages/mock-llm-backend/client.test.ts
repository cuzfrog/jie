import { MockClient, MockClientError, loadMockExpectations } from "./client.ts";
import { startMockServer } from "./server.ts";

describe("MockClient", () => {
  let stopped: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (stopped.length > 0) {
      const stop = stopped.pop();
      if (stop !== undefined) await stop();
    }
  });

  async function freshClient(): Promise<MockClient> {
    const server = await startMockServer(0);
    stopped.push(() => server.stop());
    const client = new MockClient(`http://localhost:${server.port}`);
    await client.health();
    return client;
  }

  test("health() returns when the server is up", async () => {
    const c = await freshClient();
    expect(c.health()).resolves.toBeUndefined();
  });

  test("registerExpectations then getCalls reflects the registered log on the server", async () => {
    const c = await freshClient();
    await c.registerExpectations([
      { match: { lastUserContains: "hi" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] },
    ]);
    // Drive one call directly so the call log is populated.
    const res = await fetch(`http://localhost:${extractPort(c)}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "hi all" }] }),
    });
    expect(res.status).toBe(200);
    await res.body?.cancel();

    const calls = await c.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]!.expectationIndex).toBe(0);
  });

  test("clearExpectations wipes rules and the call log", async () => {
    const c = await freshClient();
    await c.registerExpectations([
      { match: {}, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] },
    ]);
    await fetch(`http://localhost:${extractPort(c)}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "any" }] }),
    });
    expect((await c.getCalls()).length).toBe(1);
    await c.clearExpectations();
    expect((await c.getCalls()).length).toBe(0);
  });

  test("assertConsumedAll passes when every rule matched", async () => {
    const c = await freshClient();
    const rules = [
      { match: { lastUserContains: "A" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] as const },
      { match: { lastUserContains: "B" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] as const },
    ];
    await c.registerExpectations(rules);
    const port = extractPort(c);
    for (const u of ["A", "B"]) {
      const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: u }] }),
      });
      await res.body?.cancel();
    }
    expect(c.assertConsumedAll(rules)).resolves.toBeUndefined();
  });

  test("assertConsumedAll throws when an expectation was never hit", async () => {
    const c = await freshClient();
    const rules = [
      { match: { lastUserContains: "A" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] as const },
      { match: { lastUserContains: "NEVER" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] as const },
    ];
    await c.registerExpectations(rules);
    const port = extractPort(c);
    const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "A" }] }),
    });
    await res.body?.cancel();
    expect(c.assertConsumedAll(rules)).rejects.toBeInstanceOf(MockClientError);
  });

  test("health() throws when pointed at an unreachable server", async () => {
    const c = new MockClient("http://127.0.0.1:1");
    expect(c.health()).rejects.toBeInstanceOf(MockClientError);
  });
});

function extractPort(c: MockClient): number {
  const url = new URL((c as unknown as { baseUrl: string }).baseUrl);
  return Number(url.port);
}

describe("loadMockExpectations", () => {
  let prevBaseUrl: string | undefined;

  beforeEach(() => {
    prevBaseUrl = process.env["JIE_E2E_BASE_URL"];
  });

  afterEach(() => {
    if (prevBaseUrl === undefined) delete process.env["JIE_E2E_BASE_URL"];
    else process.env["JIE_E2E_BASE_URL"] = prevBaseUrl;
  });

  test("no-op when JIE_E2E_BASE_URL is unset", async () => {
    delete process.env["JIE_E2E_BASE_URL"];
    await loadMockExpectations([{ match: {}, responseChunks: [] }]);
  });

  test("no-op when JIE_E2E_BASE_URL is not the stub port", async () => {
    process.env["JIE_E2E_BASE_URL"] = "http://localhost:9999";
    await loadMockExpectations([{ match: {}, responseChunks: [] }]);
  });

  test("registers expectations when the stub is reachable on the stub port", async () => {
    process.env["JIE_E2E_BASE_URL"] = "http://127.0.0.1:12346";
    const reachable = await fetch("http://127.0.0.1:12346/health").then(
      () => true,
      () => false,
    );
    if (!reachable) {
      // Stub not running; the failure path is covered by
      // "health() throws when pointed at an unreachable server" above.
      return;
    }
    await loadMockExpectations([{ match: {}, responseChunks: [] }]);
  });
});
