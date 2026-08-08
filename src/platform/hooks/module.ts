import { asFunction, type AwilixContainer } from "awilix";
import { logger } from "../../utils";
import type { PlatformCradle } from "../container";
import { ShCommandExecutor } from "./command-executor";
import { HookRunnerImpl } from "./hook-runner";
import { loadHooksConfig } from "./load-hooks";
import type { HookRunner } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.hooks" });

export function registerHooksModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    hookRunner: asFunction((homeJieDir: string, projectJieDir: string | null): HookRunner => {
      const result = loadHooksConfig({ homeJieDir, projectJieDir });
      for (const diagnostic of result.diagnostics) {
        log.warn(`hook in ${diagnostic.path} skipped: ${diagnostic.message}`);
      }
      return new HookRunnerImpl(result.config, new ShCommandExecutor());
    }).singleton(),
  });
}
