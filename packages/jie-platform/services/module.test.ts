import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { registerServicesModule } from "./module";

function bootedContainer(cwd: string): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(cwd),
  });
  registerServicesModule(container);
  return container;
}

describe("registerServicesModule", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-services-module-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("gitService resolves a zeroed snapshot outside a git repository", () => {
    const container = bootedContainer(dir);
    expect(container.cradle.gitService.getSnapshot()).toEqual({ branch: "", dirty: false, ahead: 0, behind: 0 });
  });

  test("registers a singleton", () => {
    const container = bootedContainer(dir);
    expect(container.cradle.gitService).toBe(container.resolve("gitService"));
  });
});
