import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "./container";
import { JiePlatformImpl } from "./jie-platform";

export function registerPlatformModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    platform: asClass(JiePlatformImpl).singleton(),
  });
}
