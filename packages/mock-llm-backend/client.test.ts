import { MockClient, MockClientError, loadMockExpectations } from "./client.ts";
import { type Expectation, type RecordedCall } from "./expectations.ts";
import { DEFAULT_MOCK_PORT } from "./mock-llm-server.ts";

const TEST_BASE_URL = "http://localhost:4321";

let fetchMock = vi.spyOn(globalThis, "fetch");
fetchMock.mockRestore();

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchMock.mockRestore();
});

describe("MockClient", () => {
  const rules: ReadonlyArray<Expectation> = [
    { match: { lastUserContains: "hi" }, responseChunks: [{ kind: "text", delta: "x" }, { kind: "finish", reason: "stop" }] },
  ];

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
  });

  test("health() GETs {baseUrl}/health", async () => {
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.health()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(`${TEST_BASE_URL}/health`);
  });

  test("health() defaults the baseUrl to the stub port", async () => {
    const c = new MockClient();
    await c.health();
    expect(fetchMock).toHaveBeenCalledWith(`http://localhost:${DEFAULT_MOCK_PORT}/health`);
  });

  test("health() maps a non-2xx response to MockClientError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.health()).rejects.toBeInstanceOf(MockClientError);
    await expect(c.health()).rejects.toMatchObject({ status: 503, message: "health 503" });
  });

  test("health() maps a network failure to MockClientError with status 0", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.health()).rejects.toMatchObject({ status: 0, message: "health: connection refused" });
  });

  test("registerExpectations() POSTs the rules as a JSON body", async () => {
    const c = new MockClient(TEST_BASE_URL);
    await c.registerExpectations(rules);
    expect(fetchMock).toHaveBeenCalledWith(`${TEST_BASE_URL}/mock/expectations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectations: [...rules] }),
    });
  });

  test("registerExpectations() maps a non-2xx response to MockClientError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, {}));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.registerExpectations(rules)).rejects.toMatchObject({ status: 400, message: "register 400" });
  });

  test("clearExpectations() sends DELETE to /mock/expectations", async () => {
    const c = new MockClient(TEST_BASE_URL);
    await c.clearExpectations();
    expect(fetchMock).toHaveBeenCalledWith(`${TEST_BASE_URL}/mock/expectations`, { method: "DELETE" });
  });

  test("clearExpectations() maps errors to MockClientError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.clearExpectations()).rejects.toMatchObject({ status: 500, message: "clear 500" });
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(c.clearExpectations()).rejects.toMatchObject({ status: 0, message: "clear: boom" });
  });

  test("getCalls() GETs /mock/calls and returns the parsed call log", async () => {
    const calls: RecordedCall[] = [{ expectationIndex: 0, model: "m", lastUserText: "hi" }];
    fetchMock.mockResolvedValue(jsonResponse(200, { calls }));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.getCalls()).resolves.toEqual(calls);
    expect(fetchMock).toHaveBeenCalledWith(`${TEST_BASE_URL}/mock/calls`);
  });

  test("getCalls() maps errors to MockClientError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, {}));
    const c = new MockClient(TEST_BASE_URL);
    await expect(c.getCalls()).rejects.toMatchObject({ status: 502, message: "getCalls 502" });
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(c.getCalls()).rejects.toMatchObject({ status: 0, message: "getCalls: boom" });
  });

  test("assertConsumedAll() resolves when every rule index was hit", async () => {
    const calls: RecordedCall[] = [
      { expectationIndex: 0, model: "m", lastUserText: "A" },
      { expectationIndex: 1, model: "m", lastUserText: "B" },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { calls }));
    const c = new MockClient(TEST_BASE_URL);
    const two = [rules[0]!, rules[0]!];
    await expect(c.assertConsumedAll(two)).resolves.toBeUndefined();
  });

  test("assertConsumedAll() rejects listing the never-hit indices", async () => {
    const calls: RecordedCall[] = [{ expectationIndex: 0, model: "m", lastUserText: "A" }];
    fetchMock.mockResolvedValue(jsonResponse(200, { calls }));
    const c = new MockClient(TEST_BASE_URL);
    const two = [rules[0]!, rules[0]!];
    await expect(c.assertConsumedAll(two)).rejects.toThrow("expectations not consumed: indices 1");
  });
});

describe("loadMockExpectations", () => {
  const rules: ReadonlyArray<Expectation> = [{ match: {}, responseChunks: [] }];
  let savedBaseUrl: string | undefined;

  beforeEach(() => {
    savedBaseUrl = process.env["JIE_E2E_BASE_URL"];
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
  });

  afterEach(() => {
    if (savedBaseUrl === undefined) delete process.env["JIE_E2E_BASE_URL"];
    else process.env["JIE_E2E_BASE_URL"] = savedBaseUrl;
  });

  test("is a no-op when JIE_E2E_BASE_URL is unset", async () => {
    delete process.env["JIE_E2E_BASE_URL"];
    await loadMockExpectations(rules);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("is a no-op when JIE_E2E_BASE_URL is not the stub port", async () => {
    process.env["JIE_E2E_BASE_URL"] = "http://localhost:9999";
    await loadMockExpectations(rules);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("checks health then registers expectations on the stub port", async () => {
    const stubUrl = `http://localhost:${DEFAULT_MOCK_PORT}`;
    process.env["JIE_E2E_BASE_URL"] = stubUrl;
    await loadMockExpectations(rules);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual([`${stubUrl}/health`]);
    expect(fetchMock.mock.calls[1]).toEqual([
      `${stubUrl}/mock/expectations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectations: [...rules] }),
      },
    ]);
  });

  test("throws a startup hint when the stub is unreachable", async () => {
    process.env["JIE_E2E_BASE_URL"] = `http://localhost:${DEFAULT_MOCK_PORT}`;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(loadMockExpectations(rules)).rejects.toThrow("is not reachable");
  });
});

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status });
}
