import { asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { ModelRegistry } from "../config";
import { LlmServiceImpl } from "./llm-service";

export function registerLlmModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    llmService: asFunction((modelRegistry: ModelRegistry) => new LlmServiceImpl({ modelRegistry })).singleton(),
  });
}