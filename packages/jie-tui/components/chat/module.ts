import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { ChatMessagesImpl } from "./chat-messages";
import { KanbanList } from "./kanban-list";

export function registerChatModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatMessages: asClass(ChatMessagesImpl).singleton(),
    kanbanList: asClass(KanbanList).singleton(),
  });
}
