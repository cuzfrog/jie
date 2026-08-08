import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { InProcessEventBus } from "./event-bus";
import { EventManagerImpl } from "./event-manager";

export function registerEventModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    eventBus: asClass(InProcessEventBus).singleton(),
    eventManager: asClass(EventManagerImpl).singleton(),
  });
}
