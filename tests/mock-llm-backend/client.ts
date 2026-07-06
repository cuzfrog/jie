import { type Expectation, type RecordedCall } from "./expectations.ts";

const STUB_PORT = 12346;

export class MockClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "MockClientError";
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class MockClient {
  constructor(private readonly baseUrl: string = "http://localhost:12346") {}

  async health(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/health`);
    } catch (cause) {
      throw new MockClientError(0, `health: ${messageOf(cause)}`);
    }
    if (!res.ok) throw new MockClientError(res.status, `health ${res.status}`);
  }

  async setLogging(enabled: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/mock/logging`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new MockClientError(res.status, `setLogging ${res.status}`);
  }

  async registerExpectations(rules: ReadonlyArray<Expectation>, sessionId?: string): Promise<void> {
    const body: { expectations: Expectation[]; session?: string } = { expectations: [...rules] };
    if (sessionId !== undefined) body.session = sessionId;
    const res = await fetch(`${this.baseUrl}/mock/expectations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new MockClientError(res.status, `register ${res.status}`);
  }

  async clearExpectations(sessionId?: string): Promise<void> {
    let url = `${this.baseUrl}/mock/expectations`;
    if (sessionId !== undefined) url += `?session=${encodeURIComponent(sessionId)}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "DELETE" });
    } catch (cause) {
      throw new MockClientError(0, `clear: ${messageOf(cause)}`);
    }
    if (!res.ok) throw new MockClientError(res.status, `clear ${res.status}`);
  }

  async getCalls(sessionId?: string): Promise<RecordedCall[]> {
    let url = `${this.baseUrl}/mock/calls`;
    if (sessionId !== undefined) url += `?session=${encodeURIComponent(sessionId)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (cause) {
      throw new MockClientError(0, `getCalls: ${messageOf(cause)}`);
    }
    if (!res.ok) throw new MockClientError(res.status, `getCalls ${res.status}`);
    const body = (await res.json()) as { calls: RecordedCall[] };
    return body.calls;
  }

  async assertConsumedAll(rules: ReadonlyArray<Expectation>, sessionId?: string): Promise<void> {
    const calls = await this.getCalls(sessionId);
    const used = new Set(calls.map((c) => c.expectationIndex));
    const missing: number[] = [];
    for (let i = 0; i < rules.length; i++) if (!used.has(i)) missing.push(i);
    if (missing.length === 0) return;
    throw new MockClientError(
      0,
      `expectations not consumed: indices ${missing.join(", ")} (called ${calls.length} times)`,
    );
  }
}

function isStubUrl(url: string): boolean {
  try {
    return new URL(url).port === String(STUB_PORT);
  } catch {
    return false;
  }
}

export async function loadMockExpectations(expectations: ReadonlyArray<Expectation>, sessionId?: string): Promise<void> {
  const baseUrl = process.env["JIE_E2E_BASE_URL"] ?? "";
  if (!isStubUrl(baseUrl)) return;
  const client = new MockClient(baseUrl);
  try {
    await client.health();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `loadMockExpectations: stub at ${baseUrl} is not reachable. ` +
        `Start it with \`bun run mock:start\`.\n${reason}`,
    );
  }
  await client.registerExpectations(expectations, sessionId);
}
