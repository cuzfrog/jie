import { asClass, asFunction, type AwilixContainer } from "awilix";
import { ProcessTerminal, TuiMainScreen, type Terminal, type TUI } from "@earendil-works/pi-tui";
import type { TuiCradle } from "../container";
import type { TuiStdout } from "../tui";
import { StreamTerminalImpl } from "./stream-terminal";
import { TerminalTitleImpl } from "./terminal-title";
import { TuiRendererImpl } from "./renderer";

export function registerRenderModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    terminal: asFunction((useProcessTerminal: boolean, stdin: NodeJS.ReadableStream, stdout: TuiStdout): Terminal =>
      useProcessTerminal ? new ProcessTerminal() : new StreamTerminalImpl(stdin, stdout),
    ).singleton(),
    screen: asFunction((terminal: Terminal): TUI => new TuiMainScreen(terminal))
      .singleton()
      .disposer((screen) => screen.stop()),
    requestRender: asFunction((screen: TUI): (() => void) => (): void => screen.requestRender()).singleton(),
    terminalTitle: asClass(TerminalTitleImpl).singleton(),
    renderer: asClass(TuiRendererImpl)
      .singleton()
      .disposer((renderer) => renderer.dispose()),
  });
}
