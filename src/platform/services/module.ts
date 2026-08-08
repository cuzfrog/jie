import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { GitServiceImpl } from "./git-service";

export function registerServicesModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    gitService: asClass(GitServiceImpl).singleton(),
  });
}
