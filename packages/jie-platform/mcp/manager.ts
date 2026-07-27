import { logger } from "@cuzfrog/jie-utils";
import type { ToolRegistry } from "../tools";
import { loadMergedMcpConfig } from "./load-config";
import type { McpConnection, McpConnectionDependencies } from "./stdio-connection";
import type { SubprocessFactory } from "./subprocess";
import { createMcpTool } from "./tool-adapter";
import type { StdioMcpServerConfig } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.mcp" });

export type McpConnector = (
  serverName: string,
  config: StdioMcpServerConfig,
  deps: McpConnectionDependencies,
) => Promise<McpConnection>;

export interface McpManager {
  connectAll(): Promise<void>;
  dispose(): Promise<void>;
}

export class McpManagerImpl implements McpManager {
  private readonly connections: McpConnection[] = [];

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly homeJieDir: string,
    private readonly projectJieDir: string | null,
    private readonly subprocessFactory: SubprocessFactory,
    private readonly mcpConnector: McpConnector,
  ) {}

  async connectAll(): Promise<void> {
    const config = loadMergedMcpConfig(this.homeJieDir, this.projectJieDir);
    for (const [name, serverConfig] of config.servers) {
      if (serverConfig.transport === "http") {
        log.warn(`MCP server '${name}' uses the http transport, which is not supported in v1; skipping`);
        continue;
      }
      try {
        const connection = await this.mcpConnector(name, serverConfig, { subprocessFactory: this.subprocessFactory });
        try {
          const definitions = await connection.listTools();
          for (const definition of definitions) {
            this.toolRegistry.register(`mcp:${name}:${definition.name}`, createMcpTool(name, definition, connection));
          }
          this.connections.push(connection);
          log.info(`MCP server '${name}' connected with ${definitions.length} tools`);
        } catch (error) {
          log.warn(`MCP server '${name}' tool listing failed; skipping: ${error instanceof Error ? error.message : String(error)}`);
          await connection.close();
        }
      } catch (error) {
        log.warn(`MCP server '${name}' failed to connect; skipping: ${error instanceof Error ? error.message : String(error)}`);
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
}
