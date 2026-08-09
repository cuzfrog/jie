import { asClass, asFunction, type AwilixContainer } from "awilix";
import type { TUI } from "@earendil-works/pi-tui";
import type { TuiCradle } from "../container";
import { ChatSyncImpl } from "./chat-sync";

export function registerSyncModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    requestRender: asFunction((screen: TUI): (() => void) => (): void => screen.requestRender()).singleton(),
    chatSync: asClass(ChatSyncImpl).singleton(),
  });
}
