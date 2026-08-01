import { asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { ShCommandExecutor } from "./command-executor";
import { HookRunnerImpl } from "./hook-runner";
import { loadHooksConfig } from "./load-hooks";
import type { HookRunner } from "./types";

export function registerHooksModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    hookRunner: asFunction((homeJieDir: string, projectJieDir: string | null): HookRunner =>
      new HookRunnerImpl(loadHooksConfig({ homeJieDir, projectJieDir }), new ShCommandExecutor())
    ).singleton(),
  });
}
