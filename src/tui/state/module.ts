import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { EffectHandlerImpl } from "./effect-handler";
import { StateStoreImpl } from "./state-store";

export function registerStateModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    stateStore: asClass(StateStoreImpl).singleton(),
    effectHandler: asClass(EffectHandlerImpl)
      .singleton()
      .disposer((handler) => handler.dispose()),
  });
}
