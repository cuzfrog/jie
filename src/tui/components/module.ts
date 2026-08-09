import { asClass, asFunction, type AwilixContainer } from "awilix";
import { Container } from "@earendil-works/pi-tui";
import type { TuiCradle } from "../container";
import { WorkingSpinnerImpl } from "./working-spinner";
import { TuiViewImpl } from "./view";

export function registerComponentsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatContainer: asFunction((): Container => new Container()).singleton(),
    workingSpinner: asClass(WorkingSpinnerImpl).singleton(),
    view: asClass(TuiViewImpl).singleton(),
  });
}
