import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { Footer } from "./footer";

export function registerFooterModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    footer: asClass(Footer).singleton(),
  });
}
