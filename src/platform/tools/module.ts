import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { InMemoryToolRegistry } from "./tool-registry";

export function registerToolsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    toolRegistry: asClass(InMemoryToolRegistry).singleton(),
  });
}
