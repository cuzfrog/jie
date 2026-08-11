import { asClass, asFunction, type AwilixContainer } from "awilix";
import { type Terminal } from "@earendil-works/pi-tui";
import type { TuiCradle } from "./container";
import { ShutdownSignalImpl, type ShutdownSignal } from "./shutdown";
import { TuiImpl } from "./tui";

export function registerTuiModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    shutdownSignal: asClass(ShutdownSignalImpl)
      .singleton()
      .disposer((signal) => signal.request()),
    quitTui: asFunction(
      (terminal: Terminal, shutdownSignal: ShutdownSignal): (() => Promise<void>) =>
        async (): Promise<void> => {
          await terminal.drainInput();
          shutdownSignal.request();
        },
    ).singleton(),
    tui: asClass(TuiImpl).singleton(),
  });
}
