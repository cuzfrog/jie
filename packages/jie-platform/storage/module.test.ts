import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { registerStorageModule } from "./module";

function bootedContainer(homeJieDir: string, inMemory: boolean): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    homeJieDir: asValue(homeJieDir),
    inMemory: asValue(inMemory),
  });
  registerStorageModule(container);
  return container;
}

describe("registerStorageModule", () => {
  test("inMemory resolves a fresh isolated storage with the schema", () => {
    const a = bootedContainer("/unused", true);
    const tables = a.cradle.storage.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    expect(tables).toEqual([["artifacts"], ["memory_turns"]]);
    a.cradle.storage.exec("INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)", ["ephemeral", "x", "2025-01-01"]);
    const b = bootedContainer("/unused", true);
    expect(b.cradle.storage.query("SELECT key FROM artifacts")).toEqual([]);
  });

  test("file-backed storage lands at <homeJieDir>/storage.db", () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-storage-module-"));
    try {
      const container = bootedContainer(dir, false);
      container.cradle.storage.exec("INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)", ["k", "c", "2025-01-01"]);
      expect(existsSync(join(dir, "storage.db"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("artifactStore and memoryManager share the registered storage", async () => {
    const container = bootedContainer("/unused", true);
    await container.cradle.artifactStore.write("k1", "content-1");
    expect(await container.cradle.artifactStore.read("k1")).toMatchObject({ key: "k1", content: "content-1" });
    expect(container.cradle.memoryManager.hasSession("t1", "s1")).toBe(false);
  });

  test("registers singletons", () => {
    const container = bootedContainer("/unused", true);
    expect(container.cradle.storage).toBe(container.resolve("storage"));
    expect(container.cradle.artifactStore).toBe(container.resolve("artifactStore"));
    expect(container.cradle.memoryManager).toBe(container.resolve("memoryManager"));
  });
});
