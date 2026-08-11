import { asClass, asValue, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { CommandHandlerImpl } from "./command-handler";
import { CommandResolverImpl } from "./command-resolver";
import { SLASH_COMMANDS } from "./command-registry";

export function registerCommandModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    slashCommands: asValue(SLASH_COMMANDS),
    commandResolver: asClass(CommandResolverImpl).singleton(),
    commandHandler: asClass(CommandHandlerImpl).singleton(),
  });
}
