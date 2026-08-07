import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootPlatform } from "./container";
import { JiePlatformImpl } from "./jie-platform";

const SERVICE_KEYS = [
  "eventBus",
  "eventManager",
  "storage",
  "artifactStore",
  "transcriptStore",
  "authStore",
  "modelRegistry",
  "settingsStore",
  "llmService",
  "memoryStore",
  "memoryExtractor",
  "memoryBootstrap",
  "gitService",
  "toolRegistry",
  "agentBodyFactory",
  "teamManager",
  "commandExecutor",
  "subprocessFactory",
  "mcpConnector",
  "mcpManager",
  "platform",
] as const;

describe("bootPlatform", () => {
  let homeJieDir: string;

  beforeEach(() => {
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-container-test-"));
  });

  afterEach(() => {
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("registers every PlatformCradle service", async () => {
    const container = await bootPlatform({ cwd: tmpdir(), homeJieDir, projectJieDir: null });
    for (const key of SERVICE_KEYS) {
      expect(container.hasRegistration(key)).toBe(true);
    }
  });

  test("resolves commandExecutor and platform as singletons", async () => {
    const container = await bootPlatform({ cwd: tmpdir(), homeJieDir, projectJieDir: null });
    expect(container.cradle.commandExecutor).toBe(container.cradle.commandExecutor);
    expect(container.cradle.platform).toBe(container.cradle.platform);
    expect(container.resolve("platform")).toBe(container.cradle.platform);
  });

  test("cradle.platform resolves to a JiePlatformImpl instance", async () => {
    const container = await bootPlatform({ cwd: tmpdir(), homeJieDir, projectJieDir: null });
    expect(container.cradle.platform).toBeInstanceOf(JiePlatformImpl);
  });
});
