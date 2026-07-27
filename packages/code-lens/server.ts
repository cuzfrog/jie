import { type IndexSource } from "./index-source";
import { type CodeIndex } from "./model";
import { encodeMessage, extractMessages, type JsonObject, type JsonValue, type ResponseMessage } from "./protocol";
import { unavailabilityGuidance } from "./setup";
import { executeTool, TOOL_DEFINITIONS } from "./tools";

const SERVER_NAME = "code-lens";
const SERVER_VERSION = "0.1.0";
const LATEST_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS: ReadonlyArray<string> = ["2025-03-26", "2024-11-05"];
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const EMPTY_OBJECT: JsonObject = {};

export interface McpServer {
  receive(chunk: string): void;
}

export interface ServerDependencies {
  readonly indexSource: IndexSource;
  readonly write: (chunk: string) => void;
}

export function createMcpServer(deps: ServerDependencies): McpServer {
  let remainder = "";
  return {
    receive(chunk: string): void {
      const [lines, rest] = extractMessages(remainder + chunk);
      remainder = rest;
      for (const line of lines) {
        const response = respondToLine(line, deps.indexSource);
        if (response !== null) deps.write(encodeMessage(response));
      }
    },
  };
}

function respondToLine(line: string, indexSource: IndexSource): ResponseMessage | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(line);
  } catch {
    return errorResponse(null, PARSE_ERROR, "Parse error");
  }
  if (!isJsonObject(parsed)) return errorResponse(null, PARSE_ERROR, "Parse error");
  const method = parsed["method"];
  const id = messageId(parsed["id"]);
  if (id === null) return null;
  if (typeof method !== "string") return errorResponse(id, INVALID_REQUEST, "Invalid request: missing method");
  return respondToRequest(id, method, asObject(parsed["params"]), indexSource);
}

function respondToRequest(id: number | string, method: string, params: JsonObject, indexSource: IndexSource): ResponseMessage {
  switch (method) {
    case "initialize": return successResponse(id, initializeResult(params));
    case "ping": return successResponse(id, EMPTY_OBJECT);
    case "tools/list": return successResponse(id, { tools: TOOL_DEFINITIONS });
    case "tools/call": return callTool(id, params, indexSource);
    default: return errorResponse(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

function callTool(id: number | string, params: JsonObject, indexSource: IndexSource): ResponseMessage {
  const name = params["name"];
  if (typeof name !== "string") return errorResponse(id, INVALID_PARAMS, "Invalid params: tools/call requires a string `name`");
  const toolArguments = asObject(params["arguments"]);
  let index: CodeIndex;
  try {
    index = indexSource.load();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return successResponse(id, toolCallResult(`${reason}\n${unavailabilityGuidance(indexSource.path)}`, true));
  }
  const outcome = executeTool(index, name, toolArguments);
  return successResponse(id, toolCallResult(outcome.text, outcome.isError));
}

function initializeResult(params: JsonObject): JsonObject {
  const requested = params["protocolVersion"];
  const negotiated = typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
  return {
    protocolVersion: negotiated,
    capabilities: { tools: EMPTY_OBJECT },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  };
}

function toolCallResult(text: string, isError: boolean): JsonObject {
  return isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };
}

function successResponse(id: number | string, result: JsonObject): ResponseMessage {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: number | string | null, code: number, message: string): ResponseMessage {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function messageId(value: JsonValue | undefined): number | string | null {
  if (typeof value === "number" || typeof value === "string") return value;
  return null;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: JsonValue | undefined): JsonObject {
  return value !== undefined && isJsonObject(value) ? value : EMPTY_OBJECT;
}
