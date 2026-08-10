import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { WorkingSpinnerImpl } from "./working-spinner";
import { TuiViewImpl } from "./view";

export function registerComponentsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    workingSpinner: asClass(WorkingSpinnerImpl).singleton(),
    view: asClass(TuiViewImpl).singleton(),
  });
}
