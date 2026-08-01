import { asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { formatContextFilesForPrompt } from "./format-context";
import { loadContextFiles } from "./load-context-files";

export function registerContextModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    systemContextBlock: asFunction((cwd: string, homeJieDir: string) =>
      formatContextFilesForPrompt(loadContextFiles({ cwd, homeJieDir }))
    ).singleton(),
  });
}
