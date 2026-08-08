import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { LlmServiceImpl } from "./llm-service";

export function registerLlmModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    llmService: asClass(LlmServiceImpl).singleton().inject(() => ({ call: undefined })),
  });
}