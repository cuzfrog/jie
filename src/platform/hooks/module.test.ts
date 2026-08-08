import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlatformCradle } from "../container";
import { registerHooksModule } from "./module";
import type { HookIdentity } from "./types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeJieDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jie-hooks-module-"));
  tempDirs.push(dir);
  return dir;
}

function identity(): HookIdentity {
  return { sessionId: "s1", cwd: tmpdir(), teamId: "t1", agentKey: "general-1", role: "general" };
}

function bootedContainer(homeJieDir: string): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({ homeJieDir: asValue(homeJieDir), projectJieDir: asValue(null) });
  registerHooksModule(container);
  return container;
}

describe("registerHooksModule", () => {
  test("resolves hookRunner as a singleton", () => {
    const container = bootedContainer(makeJieDir());
    expect(container.resolve("hookRunner")).toBe(container.resolve("hookRunner"));
  });

  test("a malformed hooks block is skipped leniently and the runner still resolves", async () => {
    const homeJieDir = makeJieDir();
    writeFileSync(join(homeJieDir, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "nope" }] }] } }));
    const runner = bootedContainer(homeJieDir).resolve("hookRunner");
    await expect(runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} }))
      .resolves.toEqual({ block: false, reason: null });
  });

  test("a valid configured hook runs through the resolved runner", async () => {
    const homeJieDir = makeJieDir();
    writeFileSync(join(homeJieDir, "settings.json"), JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "exit 2" }] }] },
    }));
    const runner = bootedContainer(homeJieDir).resolve("hookRunner");
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome.block).toBe(true);
  });
});
