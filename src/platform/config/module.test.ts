import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { registerConfigModule } from "./module";

function bootedContainer(cwd: string, homeJieDir: string): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(cwd),
    homeJieDir: asValue(homeJieDir),
    projectJieDir: asValue(null),
  });
  registerConfigModule(container);
  return container;
}

describe("registerConfigModule", () => {
  let homeDir: string;
  let homeJieDir: string;
  let cwd: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-config-module-home-"));
    homeJieDir = join(homeDir, ".jie");
    cwd = mkdtempSync(join(tmpdir(), "jie-config-module-cwd-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("registers authStore, modelRegistry, and settingsStore", () => {
    const container = bootedContainer(cwd, homeJieDir);
    expect(container.hasRegistration("authStore")).toBe(true);
    expect(container.hasRegistration("modelRegistry")).toBe(true);
    expect(container.hasRegistration("settingsStore")).toBe(true);
  });

  test("registers singletons", () => {
    const container = bootedContainer(cwd, homeJieDir);
    expect(container.cradle.authStore).toBe(container.cradle.authStore);
    expect(container.cradle.modelRegistry).toBe(container.cradle.modelRegistry);
    expect(container.cradle.settingsStore).toBe(container.cradle.settingsStore);
  });
});
