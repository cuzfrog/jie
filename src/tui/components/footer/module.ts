import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { Footer } from "./footer";
import { QueueIndicatorImpl } from "./queue-indicator";

export function registerFooterModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    footer: asClass(Footer).singleton(),
    queueIndicator: asClass(QueueIndicatorImpl).singleton(),
  });
}
