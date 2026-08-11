import { asClass, asValue, type AwilixContainer } from "awilix";
import type { TuiCradle } from "./container";
import { TuiImpl } from "./tui";

export function registerTuiModule(container: AwilixContainer<TuiCradle>): void {
  async function quitTui(): Promise<void> {
    await container.cradle.terminal.drainInput();
    container.cradle.tui.stop();
  }
  container.register({
    quitTui: asValue(quitTui),
    tui: asClass(TuiImpl).singleton(),
  });
}
