import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { KeyHintsImpl } from "./key-hints";
import { ModelSegmentImpl } from "./model-segment";
import { QueuedPrompts } from "./queued-prompts";
import { StatusLine } from "./status-line";
import { TokenUsageImpl } from "./token-usage";
import { WelcomeBanner } from "./welcome-banner";
import { WorkingSpinner } from "./working-spinner";

export function registerElementsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    welcomeBanner: asClass(WelcomeBanner).singleton(),
    statusLine: asClass(StatusLine).singleton(),
    queuedPrompts: asClass(QueuedPrompts).singleton(),
    workingSpinner: asClass(WorkingSpinner).singleton(),
    tokenUsage: asClass(TokenUsageImpl).singleton(),
    keyHints: asClass(KeyHintsImpl).singleton(),
    modelSegment: asClass(ModelSegmentImpl).singleton(),
  });
}
