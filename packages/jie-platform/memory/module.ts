import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { MemoryBootstrapImpl } from "./memory-bootstrap";
import { MemoryExtractorImpl } from "./memory-extractor";
import { SqliteMemoryStore } from "./memory-store";

export function registerMemoryModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    memoryStore: asClass(SqliteMemoryStore).singleton(),
    memoryExtractor: asClass(MemoryExtractorImpl).singleton(),
    memoryBootstrap: asClass(MemoryBootstrapImpl).singleton(),
  });
}
