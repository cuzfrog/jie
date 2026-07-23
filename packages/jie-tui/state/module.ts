import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { StateStoreImpl } from "./state-store";

export function registerStateModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    stateStore: asClass(StateStoreImpl).singleton(),
  });
}
