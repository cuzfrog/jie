import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { CommandExecutorImpl } from "./command-executor";

export function registerCommandModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    commandExecutor: asClass(CommandExecutorImpl).singleton(),
  });
}
