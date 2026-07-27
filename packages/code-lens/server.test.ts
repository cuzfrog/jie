import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";
import { type IndexSource } from "./index-source";
import { type JsonObject, type ResponseMessage } from "./protocol";
import { createMcpServer } from "./server";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

const indexSource = vi.mocked<IndexSource>({
  path: "fixtures/ts-project/index.scip",
  load: vi.fn(),
});

interface Harness {
  readonly responses: ReadonlyArray<ResponseMessage>;
  send(message: object): void;
  sendRaw(chunk: string): void;
}

function createHarness(): Harness {
  const responses: ResponseMessage[] = [];
  const server = createMcpServer({
    indexSource,
    write: (chunk) => {
      for (const line of chunk.split("\n")) if (line !== "") responses.push(JSON.parse(line));
    },
  });
  return {
    responses,
    send: (message) => server.receive(JSON.stringify(message) + "\n"),
    sendRaw: (chunk) => server.receive(chunk),
  };
}

function resultOf(response: ResponseMessage): JsonObject {
  if ("result" in response) return response.result;
  throw new Error(`expected a success response, got error ${response.error.message}`);
}

function textOf(response: ResponseMessage): string {
  const content = resultOf(response)["content"];
  if (!Array.isArray(content)) throw new Error("missing content");
  const first = content[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) throw new Error("missing content block");
  const text = first["text"];
  if (typeof text !== "string") throw new Error("missing text");
  return text;
}

describe("createMcpServer", () => {
  beforeEach(() => {
    indexSource.load.mockReturnValue(index);
  });

  test("initialize negotiates a supported protocol version and announces the server", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "jie", version: "0.0.0" } } });
    const result = resultOf(harness.responses[0]);
    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.serverInfo).toEqual({ name: "code-lens", version: "0.1.0" });
  });

  test("initialize falls back to the latest version for an unknown client version", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect(resultOf(harness.responses[0]).protocolVersion).toBe("2025-03-26");
  });

  test("notifications receive no response", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    harness.send({ jsonrpc: "2.0", method: "notifications/unknown" });
    expect(harness.responses).toHaveLength(0);
  });

  test("tools/list exposes the six query tools", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = resultOf(harness.responses[0])["tools"];
    expect(Array.isArray(tools)).toBe(true);
    if (!Array.isArray(tools)) return;
    const names = tools.map((tool) => (tool !== null && typeof tool === "object" && !Array.isArray(tool) ? tool["name"] : null)).sort();
    expect(names).toEqual(["boundary_references", "code_structure", "cycles", "import_graph", "index_status", "type_graph"]);
  });

  test("tools/call returns the query text as a text content block", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "index_status", arguments: {} } });
    const response = harness.responses[0];
    expect(resultOf(response)["isError"]).toBeUndefined();
    expect(textOf(response)).toContain("scip-typescript");
  });

  test("tools/call reports unavailability with setup guidance when the index cannot be loaded", () => {
    indexSource.load.mockImplementation(() => {
      throw new Error("SCIP index not found at fixtures/ts-project/index.scip");
    });
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "index_status", arguments: {} } });
    const response = harness.responses[0];
    expect(resultOf(response)["isError"]).toBe(true);
    expect(textOf(response)).toContain("code-lens is not available");
    expect(textOf(response)).toContain("scip-typescript index");
  });

  test("tools/call without a tool name is an invalid request", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {} });
    const response = harness.responses[0];
    if ("error" in response) expect(response.error.code).toBe(-32602);
    else throw new Error("expected an error response");
  });

  test("an unknown method yields method-not-found", () => {
    const harness = createHarness();
    harness.send({ jsonrpc: "2.0", id: 6, method: "resources/list" });
    const response = harness.responses[0];
    if ("error" in response) expect(response.error.code).toBe(-32601);
    else throw new Error("expected an error response");
  });

  test("an unparseable line yields a parse error with a null id", () => {
    const harness = createHarness();
    harness.sendRaw("this is not json\n");
    const response = harness.responses[0];
    if ("error" in response) {
      expect(response.error.code).toBe(-32700);
      expect(response.id).toBeNull();
    } else throw new Error("expected an error response");
  });

  test("a message split across chunks is answered once reassembled", () => {
    const harness = createHarness();
    harness.sendRaw("{\"jsonrpc\":\"2.0\",\"id\":7,");
    expect(harness.responses).toHaveLength(0);
    harness.sendRaw("\"method\":\"ping\"}\n");
    expect(harness.responses).toHaveLength(1);
    expect(resultOf(harness.responses[0])).toEqual({});
  });
});
