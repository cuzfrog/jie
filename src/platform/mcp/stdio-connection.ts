import type { JsonObject, JsonValue } from "./json";
import type { SubprocessFactory } from "./subprocess";
import type { StdioMcpServerConfig } from "./types";

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

export interface McpToolCallOutcome {
  readonly isError: boolean;
  readonly text: string;
}

export interface McpConnection {
  listTools(): Promise<ReadonlyArray<McpToolDefinition>>;
  callTool(name: string, toolArguments: JsonObject): Promise<McpToolCallOutcome>;
  close(): Promise<void>;
}

export interface McpConnectionDependencies {
  readonly subprocessFactory: SubprocessFactory;
  readonly requestTimeoutMs?: number;
  readonly closeGraceMs?: number;
}

const PROTOCOL_VERSION = "2025-03-26";
const CLIENT_NAME = "jie-platform";
const CLIENT_VERSION = "0.1.0";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_GRACE_MS = 2_000;
const EMPTY_OBJECT: JsonObject = {};

export async function connectMcpServer(
  serverName: string,
  config: StdioMcpServerConfig,
  deps: McpConnectionDependencies,
): Promise<McpConnection> {
  const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const closeGraceMs = deps.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  const proc = deps.subprocessFactory.spawn(config.command, config.args);
  let buffer = "";
  let nextId = 0;
  let closed = false;
  let exited = false;
  const pending = new Map<number, PendingRequest>();
  let notifyExited: () => void = () => {};
  const exitPromise = new Promise<void>((resolve) => {
    notifyExited = resolve;
  });

  proc.onData((chunk) => {
    buffer += chunk;
    const [messages, remainder] = extractMessages(buffer);
    buffer = remainder;
    for (const line of messages) deliverLine(line);
  });
  proc.onExit((code) => {
    exited = true;
    failAll(new Error(`MCP server '${serverName}': process exited with code ${code === null ? "unknown" : code}`));
    notifyExited();
  });

  try {
    await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: EMPTY_OBJECT,
      clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    });
  } catch (error) {
    proc.kill();
    throw error;
  }
  notify("notifications/initialized");
  return { listTools, callTool, close };

  async function listTools(): Promise<ReadonlyArray<McpToolDefinition>> {
    const result = await request("tools/list");
    const tools = result["tools"];
    if (!Array.isArray(tools)) throw new Error(`MCP server '${serverName}': tools/list returned no tools array`);
    const definitions: McpToolDefinition[] = [];
    for (const tool of tools) {
      if (!isJsonObject(tool)) throw new Error(`MCP server '${serverName}': tools/list contains a non-object entry`);
      const name = tool["name"];
      if (typeof name !== "string") throw new Error(`MCP server '${serverName}': tools/list contains a tool without a string name`);
      const description = tool["description"];
      const inputSchema = tool["inputSchema"];
      definitions.push({
        name,
        description: typeof description === "string" ? description : "",
        inputSchema: isJsonObject(inputSchema) ? inputSchema : EMPTY_OBJECT,
      });
    }
    return definitions;
  }

  async function callTool(name: string, toolArguments: JsonObject): Promise<McpToolCallOutcome> {
    const result = await request("tools/call", { name, arguments: toolArguments });
    const content = result["content"];
    if (!Array.isArray(content)) throw new Error(`MCP server '${serverName}': tool '${name}' returned no content array`);
    const parts: string[] = [];
    for (const block of content) {
      if (isJsonObject(block) && block["type"] === "text" && typeof block["text"] === "string") parts.push(block["text"]);
    }
    return { isError: result["isError"] === true, text: parts.join("\n") };
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    failAll(new Error(`MCP server '${serverName}': connection is closed`));
    proc.endStdin();
    await Promise.race([exitPromise, sleep(closeGraceMs)]);
    if (!exited) proc.kill();
  }

  function request(method: string, params?: JsonObject): Promise<JsonObject> {
    if (closed || exited) return Promise.reject(new Error(`MCP server '${serverName}': connection is closed`));
    const id = nextId++;
    proc.write(encodeMessage(params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params }));
    return new Promise<JsonObject>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP server '${serverName}': timed out after ${requestTimeoutMs}ms waiting for '${method}'`));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  }

  function notify(method: string): void {
    if (closed || exited) return;
    proc.write(encodeMessage({ jsonrpc: "2.0", method }));
  }

  function deliverLine(line: string): void {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!isJsonObject(parsed)) return;
    if (parsed["method"] !== undefined) return;
    const id = parsed["id"];
    if (typeof id !== "number") return;
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    const error = parsed["error"];
    if (isJsonObject(error)) {
      entry.reject(new Error(`MCP server '${serverName}': ${errorMessage(error)}`));
      return;
    }
    const result = parsed["result"];
    entry.resolve(isJsonObject(result) ? result : EMPTY_OBJECT);
  }

  function failAll(error: Error): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }
}

interface PendingRequest {
  resolve(result: JsonObject): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: string;
  readonly params?: JsonObject;
}

interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
}

function encodeMessage(message: JsonRpcRequest | JsonRpcNotification): string {
  return JSON.stringify(message) + "\n";
}

function extractMessages(buffer: string): readonly [messages: ReadonlyArray<string>, remainder: string] {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const messages: string[] = [];
  for (const line of lines) {
    if (line.trim() !== "") messages.push(line);
  }
  return [messages, remainder];
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: JsonObject): string {
  const message = error["message"];
  const code = error["code"];
  return `${typeof message === "string" ? message : "unknown error"} (code ${typeof code === "number" ? code : "unknown"})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
