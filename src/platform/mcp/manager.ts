import { logger } from "../../utils";
import type { ToolRegistry } from "../tools";
import type { McpConnection, McpConnectionDependencies } from "./stdio-connection";
import type { SubprocessFactory } from "./subprocess";
import { createMcpTool } from "./tool-adapter";
import type { McpConfig, McpServerConfig, McpServerSummary, McpToolSummary, StdioMcpServerConfig } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.mcp" });

export type McpConnector = (
  serverName: string,
  config: StdioMcpServerConfig,
  deps: McpConnectionDependencies,
) => Promise<McpConnection>;

export interface McpManager {
  connectAll(): Promise<void>;
  dispose(): Promise<void>;
  listServers(): ReadonlyArray<McpServerSummary>;
}

export class McpManagerImpl implements McpManager {
  private readonly connections: McpConnection[] = [];
  private readonly serverSummaries: McpServerSummary[] = [];

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly mcpConfig: McpConfig,
    private readonly subprocessFactory: SubprocessFactory,
    private readonly mcpConnector: McpConnector,
  ) {}

  async connectAll(): Promise<void> {
    for (const [name, serverConfig] of this.mcpConfig.servers) {
      const { summary, connection } = await connectServer(this.toolRegistry, this.mcpConnector, this.subprocessFactory, name, serverConfig);
      this.serverSummaries.push(summary);
      if (connection !== null) {
        this.connections.push(connection);
      }
      if (summary.status === "connected") {
        log.info(`MCP server '${name}' connected with ${summary.tools.length} tools`);
      }
    }
  }

  async dispose(): Promise<void> {
    const connections = this.connections.splice(0, this.connections.length);
    for (const connection of connections) {
      try {
        await connection.close();
      } catch (error) {
        log.warn(`MCP connection close failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  listServers(): ReadonlyArray<McpServerSummary> {
    return this.serverSummaries;
  }
}

interface ConnectResult {
  readonly summary: McpServerSummary;
  readonly connection: McpConnection | null;
}

async function connectServer(
  toolRegistry: ToolRegistry,
  mcpConnector: McpConnector,
  subprocessFactory: SubprocessFactory,
  name: string,
  serverConfig: McpServerConfig,
): Promise<ConnectResult> {
  if (serverConfig.transport === "http") {
    log.warn(`MCP server '${name}' uses the http transport, which is not supported in v1; skipping`);
    const summary: McpServerSummary = { name, transport: "http", status: "skipped", tools: [], detail: "http transport not supported in v1" };
    return { summary, connection: null };
  }
  try {
    const connection = await mcpConnector(name, serverConfig, { subprocessFactory });
    try {
      const definitions = await connection.listTools();
      for (const definition of definitions) {
        toolRegistry.register(`mcp:${name}:${definition.name}`, createMcpTool(name, definition, connection));
      }
      const summary: McpServerSummary = { name, transport: "stdio", status: "connected", tools: definitions.map(toolSummary), detail: null };
      return { summary, connection };
    } catch (error) {
      log.warn(`MCP server '${name}' tool listing failed; skipping: ${error instanceof Error ? error.message : String(error)}`);
      await connection.close();
      const summary: McpServerSummary = { name, transport: "stdio", status: "failed", tools: [], detail: error instanceof Error ? error.message : String(error) };
      return { summary, connection: null };
    }
  } catch (error) {
    log.warn(`MCP server '${name}' failed to connect; skipping: ${error instanceof Error ? error.message : String(error)}`);
    const summary: McpServerSummary = { name, transport: "stdio", status: "failed", tools: [], detail: error instanceof Error ? error.message : String(error) };
    return { summary, connection: null };
  }
}

function toolSummary(definition: { readonly name: string; readonly description?: string }): McpToolSummary {
  return { name: definition.name, description: definition.description ?? null };
}
