import { asClass, asFunction, type AwilixContainer } from "awilix";
import { type Terminal } from "@earendil-works/pi-tui";
import type { TuiCradle } from "./container";
import { TuiImpl, type Tui } from "./tui";

export function registerTuiModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    quitTui: asFunction(
      (terminal: Terminal, tui: Tui): (() => Promise<void>) =>
        async (): Promise<void> => {
          await terminal.drainInput();
          tui.requestShutdown();
        },
    ).singleton(),
    tui: asClass(TuiImpl)
      .singleton()
      .disposer((tui) => tui.requestShutdown()),
  });
}
