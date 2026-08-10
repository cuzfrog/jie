import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { QueuedPrompts } from "./queued-prompts";
import { StatusLine } from "./status-line";
import { ThinkingTickerImpl } from "./thinking-ticker";
import { TransientAgerImpl } from "./transient-ager";
import { WelcomeBanner } from "./welcome-banner";

export function registerElementsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    welcomeBanner: asClass(WelcomeBanner).singleton(),
    statusLine: asClass(StatusLine).singleton(),
    queuedPrompts: asClass(QueuedPrompts).singleton(),
    thinkingTicker: asClass(ThinkingTickerImpl).singleton(),
    transientAger: asClass(TransientAgerImpl).singleton(),
  });
}
