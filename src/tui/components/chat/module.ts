import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { ChatMessagesImpl } from "./chat-messages";
import { ChatSyncImpl } from "./chat-sync";
import { KanbanList } from "./kanban-list";

export function registerChatModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatMessages: asClass(ChatMessagesImpl).singleton(),
    chatSync: asClass(ChatSyncImpl).singleton(),
    kanbanList: asClass(KanbanList).singleton(),
  });
}
