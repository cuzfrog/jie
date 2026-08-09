import { asClass, asFunction, type AwilixContainer } from "awilix";
import { ProcessTerminal, TuiMainScreen, type Terminal, type TUI } from "@earendil-works/pi-tui";
import type { TuiCradle } from "./container";
import { CommandHandlerImpl } from "./command-handler";
import { CommandResolverImpl } from "./command-resolver";
import { StreamTerminalImpl } from "./stream-terminal";
import { TuiImpl, type TuiStdout } from "./tui";

export function registerTuiModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    commandResolver: asClass(CommandResolverImpl).singleton(),
    commandHandler: asClass(CommandHandlerImpl).singleton(),
    terminal: asFunction((useProcessTerminal: boolean, stdin: NodeJS.ReadableStream, stdout: TuiStdout): Terminal =>
      useProcessTerminal ? new ProcessTerminal() : new StreamTerminalImpl(stdin, stdout),
    ).singleton(),
    screen: asFunction((terminal: Terminal): TUI => new TuiMainScreen(terminal)).singleton(),
    tui: asClass(TuiImpl).singleton(),
  });
}
