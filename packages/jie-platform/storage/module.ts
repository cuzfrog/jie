import { join } from "node:path";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { SqliteArtifactStore } from "./artifact-store";
import { SqliteTranscriptStore } from "./transcript-store";
import { SqliteStorage } from "./sqlite-storage";

export function registerStorageModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    storage: asFunction((homeJieDir: string, inMemory: boolean) => new SqliteStorage(inMemory ? ":memory:" : join(homeJieDir, "storage.db"))).singleton(),
    artifactStore: asClass(SqliteArtifactStore).singleton(),
    transcriptStore: asClass(SqliteTranscriptStore).singleton(),
  });
}
