import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { CommandHandlerImpl } from "./command-handler";
import { CommandRegistryImpl } from "./command-registry";
import { CommandResolverImpl } from "./command-resolver";

export function registerCommandModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    commandRegistry: asClass(CommandRegistryImpl).singleton(),
    commandResolver: asClass(CommandResolverImpl).singleton(),
    commandHandler: asClass(CommandHandlerImpl).singleton(),
  });
}
