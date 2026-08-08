import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { MemoryBootstrapImpl } from "./memory-bootstrap";
import { MemoryDistillerImpl } from "./memory-distiller";
import { MemoryManagerImpl } from "./memory-manager";
import { SqliteMemoryStore } from "./memory-store";
import { MemoryWriterImpl } from "./memory-writer";

export function registerMemoryModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    memoryStore: asClass(SqliteMemoryStore).singleton(),
    memoryWriter: asClass(MemoryWriterImpl).singleton(),
    memoryDistiller: asClass(MemoryDistillerImpl).singleton(),
    memoryBootstrap: asClass(MemoryBootstrapImpl).singleton(),
    memoryManager: asClass(MemoryManagerImpl).singleton(),
  });
}
