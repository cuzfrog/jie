import { asClass, asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { ModelRegistry, SettingsStore } from "../config";
import type { LlmService } from "../llm";
import { MemoryExtractorImpl } from "./memory-extractor";
import { SqliteMemoryStore, type MemoryStore } from "./memory-store";

export function registerMemoryModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    memoryStore: asClass(SqliteMemoryStore).singleton(),
    memoryExtractor: asFunction(
      (llmService: LlmService, memoryStore: MemoryStore, modelRegistry: ModelRegistry, settingsStore: SettingsStore) =>
        new MemoryExtractorImpl({ llmService, memoryStore, modelRegistry, settingsStore }),
    ).singleton(),
  });
}