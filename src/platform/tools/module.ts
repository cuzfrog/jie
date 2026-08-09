import { asClass, asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { InMemoryToolRegistry } from "./tool-registry";
import { createBuiltinTools } from "./builtins";

export function registerToolsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    builtinTools: asFunction(createBuiltinTools).singleton(),
    toolRegistry: asClass(InMemoryToolRegistry).singleton(),
  });
}
