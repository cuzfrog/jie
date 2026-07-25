export type JsonValue = JsonArray | JsonObject | string | number | boolean | null;

export interface JsonArray extends ReadonlyArray<JsonValue> {}

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonRpcRequest = {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly method: string;
  readonly params?: JsonObject;
};

export type JsonRpcNotification = {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: JsonObject;
};

export type JsonRpcError = {
  readonly code: number;
  readonly message: string;
};

export type SuccessResponse = {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly result: JsonObject;
};

export type ErrorResponse = {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly error: JsonRpcError;
};

export type ResponseMessage = SuccessResponse | ErrorResponse;

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

export type ToolTextContent = {
  readonly type: "text";
  readonly text: string;
};

export type ToolCallResult = {
  readonly content: ReadonlyArray<ToolTextContent>;
  readonly isError?: boolean;
};

export function encodeMessage(message: ResponseMessage): string {
  return JSON.stringify(message) + "\n";
}

export function extractMessages(buffer: string): readonly [messages: ReadonlyArray<string>, remainder: string] {
  const segments = buffer.split("\n");
  const remainder = segments.pop() ?? "";
  return [segments.filter((segment) => segment.trim() !== ""), remainder];
}
