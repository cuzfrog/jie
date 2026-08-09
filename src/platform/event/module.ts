import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { InProcessEventManager } from "./event-manager";

export function registerEventModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    eventManager: asClass(InProcessEventManager).singleton(),
  });
}
