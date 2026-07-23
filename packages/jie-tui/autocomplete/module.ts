import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";

export function registerAutocompleteModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    autocompleteProvider: asClass(JieAutocompleteProviderImpl).singleton(),
  });
}
