import { join } from "node:path";

const MAIN_PATH = join(import.meta.dir, "../../../src/code-lens/main.ts");
const FIXTURE_INDEX = join(import.meta.dir, "../../../src/code-lens/fixtures/ts-project/index.scip");
const MISSING_INDEX = join(import.meta.dir, "does-not-exist.scip");
const REQUEST_TIMEOUT_MS = 4000;

type McpValue = McpValue[] | McpObject | string | number | boolean | null;

interface McpObject {
  readonly [key: string]: McpValue;
}

interface McpResult {
  readonly result?: McpObject;
  readonly error?: { readonly code: number; readonly message: string };
}

interface McpClient {
  request(method: string, params?: McpObject): Promise<McpResult>;
  notify(method: string, params?: McpObject): void;
  close(): Promise<void>;
}

function asObject(value: McpValue | undefined, label: string): McpObject {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error(`expected an object at ${label}`);
}

function textOf(result: McpObject): string {
  const content = result["content"];
  if (!Array.isArray(content) || content.length === 0) throw new Error("expected a non-empty content array");
  const text = asObject(content[0], "content[0]")["text"];
  if (typeof text !== "string") throw new Error("expected a text content block");
  return text;
}

function createLineReader(stream: ReadableStream<Uint8Array>): () => Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return async (): Promise<string> => {
    while (true) {
      const newlinePosition = buffer.indexOf("\n");
      if (newlinePosition !== -1) {
        const line = buffer.slice(0, newlinePosition);
        buffer = buffer.slice(newlinePosition + 1);
        return line;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("server closed stdout");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
}

function connect(indexPath: string): McpClient {
  const proc = Bun.spawn(["bun", MAIN_PATH, indexPath], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
  const readLine = createLineReader(proc.stdout);
  let nextId = 0;
  const pending = new Map<number, (response: McpResult) => void>();
  void (async (): Promise<void> => {
    while (true) {
      const line = await readLine();
      const message: { readonly id?: number } & McpResult = JSON.parse(line);
      if (message.id === undefined) continue;
      const resolve = pending.get(message.id);
      if (resolve === undefined) continue;
      pending.delete(message.id);
      resolve(message);
    }
  })().catch(() => {});
  return {
    request(method: string, params?: McpObject): Promise<McpResult> {
      const id = nextId++;
      void proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }) + "\n");
      return new Promise<McpResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timed out waiting for a response to ${method}`));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
      });
    },
    notify(method: string, params?: McpObject): void {
      void proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }) + "\n");
    },
    async close(): Promise<void> {
      proc.stdin.end();
      await Promise.race([proc.exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
      proc.kill();
    },
  };
}

async function withClient(indexPath: string, run: (client: McpClient) => Promise<void>): Promise<void> {
  const client = connect(indexPath);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

describe("code-lens MCP server over stdio", () => {
  test("completes the initialize handshake and announces the server", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const init = await client.request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "jie-e2e", version: "0.0.0" },
      });
      const result = asObject(init.result, "initialize.result");
      expect(result["protocolVersion"]).toBe("2025-03-26");
      expect(result["serverInfo"]).toEqual({ name: "code-lens", version: "0.1.0" });
      client.notify("notifications/initialized");
    });
  });

  test("lists the six query tools", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const listed = await client.request("tools/list");
      const tools = asObject(listed.result, "tools/list.result")["tools"];
      if (!Array.isArray(tools)) throw new Error("expected a tools array");
      const names = tools.map((tool) => asObject(tool, "tool")["name"]).sort();
      expect(names).toEqual(["boundary_references", "code_structure", "cycles", "import_graph", "index_status", "type_graph"]);
    });
  });

  test("index_status summarizes the fixture index", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const called = await client.request("tools/call", { name: "index_status", arguments: {} });
      const result = asObject(called.result, "tools/call.result");
      expect(result["isError"]).toBeUndefined();
      expect(textOf(result)).toContain("scip-typescript");
      expect(textOf(result)).toContain("2 files");
    });
  });

  test("code_structure exposes declarations without implementation bodies", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const called = await client.request("tools/call", { name: "code_structure", arguments: {} });
      const text = textOf(asObject(called.result, "tools/call.result"));
      expect(text).toContain("interface Animal");
      expect(text).toContain("class Dog");
      expect(text).not.toContain("woof");
    });
  });

  test("import_graph and cycles describe the file dependency graph", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const graph = await client.request("tools/call", { name: "import_graph", arguments: {} });
      expect(textOf(asObject(graph.result, "import_graph.result"))).toContain("src/index.ts -> src/animal.ts");
      const cycles = await client.request("tools/call", { name: "cycles", arguments: { scope: "files" } });
      expect(textOf(asObject(cycles.result, "cycles.result"))).toBe("No cycles detected.");
    });
  });

  test("type_graph shows the implements relationship", async () => {
    await withClient(FIXTURE_INDEX, async (client) => {
      const called = await client.request("tools/call", { name: "type_graph", arguments: {} });
      expect(textOf(asObject(called.result, "type_graph.result"))).toContain("Dog -> Animal [implements]");
    });
  });

  test("reports unavailability with setup guidance when the index is missing", async () => {
    await withClient(MISSING_INDEX, async (client) => {
      const init = await client.request("initialize", { protocolVersion: "2025-03-26" });
      expect(asObject(init.result, "initialize.result")["serverInfo"]).toBeDefined();
      const called = await client.request("tools/call", { name: "index_status", arguments: {} });
      const result = asObject(called.result, "tools/call.result");
      expect(result["isError"]).toBe(true);
      expect(textOf(result)).toContain("code-lens is not available");
      expect(textOf(result)).toContain("scip-typescript index");
    });
  });
});
