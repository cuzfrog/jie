import { asClass, asValue, type AwilixContainer } from "awilix";
import type { Terminal } from "@earendil-works/pi-tui";
import type { TuiCradle } from "./container";
import { CommandHandlerImpl } from "./command-handler";
import { CommandResolverImpl } from "./command-resolver";
import { StreamTerminalImpl } from "./stream-terminal";
import { TuiImpl, type TuiStdout } from "./tui";

export function registerTuiModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    commandResolver: asClass(CommandResolverImpl).singleton(),
    commandHandler: asClass(CommandHandlerImpl).singleton(),
    terminalFactory: asValue((stdin: NodeJS.ReadableStream, stdout: TuiStdout): Terminal => new StreamTerminalImpl(stdin, stdout)),
    tui: asClass(TuiImpl).singleton(),
  });
}
