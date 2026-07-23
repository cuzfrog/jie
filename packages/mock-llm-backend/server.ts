import { createContainer, InjectionMode } from "awilix";
import { logger as log } from "@cuzfrog/jie-utils";
import { registerMockServerModule, type MockServerCradle } from "./module.ts";

async function main(): Promise<void> {
  const container = createContainer<MockServerCradle>({ injectionMode: InjectionMode.CLASSIC });
  registerMockServerModule(container);
  const server = container.cradle.mockLlmServer;
  log.info(`mock-llm-backend listening on http://localhost:${server.port}`);
  const shutdown = async (): Promise<void> => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  await main();
}
