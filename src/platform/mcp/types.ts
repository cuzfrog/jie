export interface McpServerAuth {
  readonly tokenEnv: string;
}

export interface StdioMcpServerConfig {
  readonly transport: "stdio";
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly auth: McpServerAuth | null;
}

export interface HttpMcpServerConfig {
  readonly transport: "http";
  readonly url: string;
  readonly auth: McpServerAuth | null;
}

export type McpServerConfig = StdioMcpServerConfig | HttpMcpServerConfig;

export interface McpConfig {
  readonly servers: ReadonlyMap<string, McpServerConfig>;
}
