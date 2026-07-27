import { asClass, asValue, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { McpManagerImpl } from "./manager";
import { connectMcpServer } from "./stdio-connection";
import { createBunSubprocessFactory } from "./subprocess";

export function registerMcpModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    subprocessFactory: asValue(createBunSubprocessFactory()),
    mcpConnector: asValue(connectMcpServer),
    mcpManager: asClass(McpManagerImpl).singleton(),
  });
}
