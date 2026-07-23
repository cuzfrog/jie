import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { ChatMessagesImpl } from "./chat-messages";
import { TodoList } from "./todo-list";

export function registerChatModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatMessages: asClass(ChatMessagesImpl).singleton(),
    todoList: asClass(TodoList).singleton(),
  });
}
