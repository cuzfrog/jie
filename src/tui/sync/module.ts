import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../container";
import { ChatSyncImpl } from "./chat-sync";

export function registerSyncModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatSync: asClass(ChatSyncImpl).singleton(),
  });
}
