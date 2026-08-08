import { asClass, asValue, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { scanFiles } from "../file-mention";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";

export function registerAutocompleteModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    scan: asValue(scanFiles),
    autocompleteProvider: asClass(JieAutocompleteProviderImpl).singleton(),
  });
}
