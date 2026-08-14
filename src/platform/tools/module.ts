import { asClass, asFunction, type AwilixContainer } from "awilix";
import { randomUUID } from "node:crypto";
import type { PlatformCradle } from "../container";
import { InMemoryToolRegistry } from "./tool-registry";
import { createBuiltinTools } from "./builtins";
import { InProcessQuestionBroker } from "./ask-user-questions-broker";

export function registerToolsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    builtinTools: asFunction(createBuiltinTools).singleton(),
    toolRegistry: asClass(InMemoryToolRegistry).singleton(),
    questionBroker: asClass(InProcessQuestionBroker).singleton().inject(() => ({ generateId: () => randomUUID() })),
  });
}
