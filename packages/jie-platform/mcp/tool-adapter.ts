import type { ExecutionContext, Tool, ToolResult } from "../tools";
import type { JsonObject } from "./json";
import { jsonSchemaToTypebox } from "./schema";
import type { McpConnection, McpToolDefinition } from "./stdio-connection";

const MAX_TOOL_NAME_LENGTH = 64;
const ILLEGAL_NAME_CHARACTERS = /[^a-zA-Z0-9_-]/g;

export function createMcpTool(serverName: string, definition: McpToolDefinition, connection: McpConnection): Tool<JsonObject> {
  const toolName = definition.name;
  return {
    name: sanitizeToolName(`mcp_${serverName}_${toolName}`),
    description: definition.description,
    label: `mcp:${serverName}:${toolName}`,
    parameters: jsonSchemaToTypebox(definition.inputSchema),
    async execute(input: JsonObject, _executionContext: ExecutionContext, signal?: AbortSignal): Promise<ToolResult> {
      const outcome = await abortable(connection.callTool(toolName, input), signal);
      if (outcome.isError) {
        throw new Error(outcome.text === "" ? `MCP server '${serverName}': tool '${toolName}' returned an error` : outcome.text);
      }
      return { content: outcome.text };
    },
  };
}

function sanitizeToolName(raw: string): string {
  return raw.replaceAll(ILLEGAL_NAME_CHARACTERS, "_").slice(0, MAX_TOOL_NAME_LENGTH);
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("tool call aborted");
}
