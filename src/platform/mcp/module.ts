import { asClass, asFunction, asValue, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { loadMergedMcpConfig } from "./load-config";
import { McpManagerImpl } from "./manager";
import { connectMcpServer } from "./stdio-connection";
import { createBunSubprocessFactory } from "./subprocess";

export function registerMcpModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    subprocessFactory: asValue(createBunSubprocessFactory()),
    mcpConnector: asValue(connectMcpServer),
    mcpConfig: asFunction((homeJieDir: string, projectJieDir: string | null) => loadMergedMcpConfig(homeJieDir, projectJieDir)).singleton(),
    mcpManager: asClass(McpManagerImpl).singleton(),
  });
}
