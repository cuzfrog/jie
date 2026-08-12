import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { TuiViewImpl } from "./view";

export function registerComponentsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    view: asClass(TuiViewImpl)
      .singleton()
      .disposer((view) => view.dispose()),
  });
}
