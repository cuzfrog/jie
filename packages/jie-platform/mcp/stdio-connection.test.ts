import type { JsonObject, JsonValue } from "./json";
import { connectMcpServer, type McpConnection } from "./stdio-connection";
import type { Subprocess, SubprocessFactory } from "./subprocess";
import type { StdioMcpServerConfig } from "./types";

const SERVER_CONFIG: StdioMcpServerConfig = { transport: "stdio", command: "fake", args: [], auth: null };

interface WireMessage {
  readonly [key: string]: JsonValue | undefined;
  readonly id?: number;
  readonly method?: string;
  readonly params?: JsonObject;
}

interface FakeSubprocess extends Subprocess {
  readonly received: WireMessage[];
  stdinEnded: boolean;
  killCount: number;
  emit(chunk: string): void;
  exitWith(code: number | null): void;
}

interface FakeOptions {
  readonly exitOnStdinEnd?: boolean;
}

function createFakeSubprocess(
  respond: (method: string, params: JsonObject, id: number) => JsonObject | null,
  options: FakeOptions = {},
): FakeSubprocess {
  let dataHandler: ((chunk: string) => void) | null = null;
  let exitHandler: ((code: number | null) => void) | null = null;
  const fake: FakeSubprocess = {
    received: [],
    stdinEnded: false,
    killCount: 0,
    write(chunk: string): void {
      for (const line of chunk.split("\n")) {
        if (line.trim() === "") continue;
        const message: WireMessage = JSON.parse(line);
        fake.received.push(message);
        const id = message.id;
        const method = message.method;
        if (id === undefined || method === undefined) continue;
        const result = respond(method, message.params ?? {}, id);
        if (result !== null) {
          queueMicrotask(() => fake.emit(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"));
        }
      }
    },
    endStdin(): void {
      fake.stdinEnded = true;
      if (options.exitOnStdinEnd === true) queueMicrotask(() => fake.exitWith(null));
    },
    onData(handler: (chunk: string) => void): void {
      dataHandler = handler;
    },
    onExit(handler: (code: number | null) => void): void {
      exitHandler = handler;
    },
    kill(): void {
      fake.killCount += 1;
    },
    emit(chunk: string): void {
      dataHandler?.(chunk);
    },
    exitWith(code: number | null): void {
      exitHandler?.(code);
    },
  };
  return fake;
}

function initializeResult(): JsonObject {
  return { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "fake-server", version: "9.9.9" } };
}

function createFactory(fake: FakeSubprocess): SubprocessFactory {
  return { spawn: (): Subprocess => fake };
}

async function connect(
  fake: FakeSubprocess,
  overrides: Partial<{ requestTimeoutMs: number; closeGraceMs: number }> = {},
): Promise<McpConnection> {
  return connectMcpServer("fake-server", SERVER_CONFIG, {
    subprocessFactory: createFactory(fake),
    requestTimeoutMs: 200,
    closeGraceMs: 50,
    ...overrides,
  });
}

describe("connectMcpServer", () => {
  test("performs the initialize handshake and the initialized notification", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    await connect(fake);
    const request = fake.received.find((message) => message.method === "initialize");
    expect(request?.params).toEqual({
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "jie-platform", version: "0.1.0" },
    });
    const notification = fake.received.find((message) => message.method === "notifications/initialized");
    expect(notification).toBeDefined();
    expect(notification?.id).toBeUndefined();
  });

  test("rejects when the initialize request fails, and kills the orphaned process", async () => {
    const fake = createFakeSubprocess(() => null);
    await expect(connect(fake, { requestTimeoutMs: 30 })).rejects.toThrow(/fake-server.*timed out.*initialize/);
    expect(fake.killCount).toBe(1);
  });
});

describe("McpConnection", () => {
  test("listTools parses tool definitions", async () => {
    const fake = createFakeSubprocess((method) => {
      if (method === "initialize") return initializeResult();
      if (method === "tools/list") {
        return { tools: [{ name: "code_structure", description: "shows structure", inputSchema: { type: "object" } }] };
      }
      return null;
    });
    const connection = await connect(fake);
    expect(await connection.listTools()).toEqual([
      { name: "code_structure", description: "shows structure", inputSchema: { type: "object" } },
    ]);
  });

  test("listTools defaults a missing description to an empty string and schema to an empty object", async () => {
    const fake = createFakeSubprocess((method) => {
      if (method === "initialize") return initializeResult();
      if (method === "tools/list") return { tools: [{ name: "bare" }] };
      return null;
    });
    const connection = await connect(fake);
    expect(await connection.listTools()).toEqual([{ name: "bare", description: "", inputSchema: {} }]);
  });

  test("listTools rejects when the server returns no tools array", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : {}));
    const connection = await connect(fake);
    await expect(connection.listTools()).rejects.toThrow(/tools\/list returned no tools array/);
  });

  test("callTool sends name and arguments, and extracts the text content", async () => {
    const fake = createFakeSubprocess((method, params) => {
      if (method === "initialize") return initializeResult();
      if (method === "tools/call") return { content: [{ type: "text", text: `called ${params["name"]}` }] };
      return null;
    });
    const connection = await connect(fake);
    const outcome = await connection.callTool("index_status", { pathPrefix: "src" });
    expect(outcome).toEqual({ isError: false, text: "called index_status" });
    const call = fake.received.find((message) => message.method === "tools/call");
    expect(call?.params).toEqual({ name: "index_status", arguments: { pathPrefix: "src" } });
  });

  test("callTool joins multiple text blocks with newlines", async () => {
    const content: JsonValue[] = [{ type: "text", text: "first" }, { type: "image", data: "x" }, { type: "text", text: "second" }];
    const fake = createFakeSubprocess((method) => {
      if (method === "initialize") return initializeResult();
      if (method === "tools/call") return { content };
      return null;
    });
    const connection = await connect(fake);
    expect((await connection.callTool("t", {})).text).toBe("first\nsecond");
  });

  test("callTool surfaces the server isError flag", async () => {
    const fake = createFakeSubprocess((method) => {
      if (method === "initialize") return initializeResult();
      if (method === "tools/call") return { isError: true, content: [{ type: "text", text: "no index" }] };
      return null;
    });
    const connection = await connect(fake);
    expect(await connection.callTool("t", {})).toEqual({ isError: true, text: "no index" });
  });

  test("a JSON-RPC error response rejects with the server name and the error message", async () => {
    const fake = createFakeSubprocess((method, _params, id) => {
      if (method === "initialize") return initializeResult();
      queueMicrotask(() =>
        fake.emit(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } }) + "\n"),
      );
      return null;
    });
    const connection = await connect(fake);
    await expect(connection.listTools()).rejects.toThrow(/fake-server.*method not found.*-32601/);
  });

  test("reassembles a response split across two stdout chunks", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    const connection = await connect(fake);
    const pending = connection.listTools();
    const request = fake.received.find((message) => message.method === "tools/list");
    const full = JSON.stringify({ jsonrpc: "2.0", id: request?.id, result: { tools: [{ name: "split" }] } }) + "\n";
    fake.emit(full.slice(0, 10));
    fake.emit(full.slice(10));
    expect((await pending).map((tool) => tool.name)).toEqual(["split"]);
  });

  test("times out a request that never receives a response", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    const connection = await connect(fake, { requestTimeoutMs: 30 });
    await expect(connection.listTools()).rejects.toThrow(/fake-server.*timed out.*tools\/list/);
  });

  test("process exit rejects in-flight requests", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    const connection = await connect(fake);
    const pending = connection.callTool("slow", {});
    fake.exitWith(1);
    await expect(pending).rejects.toThrow(/fake-server.*exited with code 1/);
  });

  test("requests after process exit reject immediately", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    const connection = await connect(fake);
    fake.exitWith(0);
    await expect(connection.listTools()).rejects.toThrow(/fake-server.*closed/);
  });

  test("close ends stdin, awaits a clean exit, and does not kill", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null), {
      exitOnStdinEnd: true,
    });
    const connection = await connect(fake);
    await connection.close();
    expect(fake.stdinEnded).toBe(true);
    expect(fake.killCount).toBe(0);
  });

  test("close kills the process when it ignores stdin end, and is idempotent", async () => {
    const fake = createFakeSubprocess((method) => (method === "initialize" ? initializeResult() : null));
    const connection = await connect(fake, { closeGraceMs: 20 });
    await connection.close();
    expect(fake.stdinEnded).toBe(true);
    expect(fake.killCount).toBe(1);
    await connection.close();
    expect(fake.killCount).toBe(1);
  });
});
