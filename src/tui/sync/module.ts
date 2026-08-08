import { asFunction, type AwilixContainer } from "awilix";
import type { Container } from "@earendil-works/pi-tui";
import type { ChatMessages } from "../components/chat";
import type { StateStore } from "../state";
import type { TuiCradle } from "../container";
import { ChatSyncImpl, type ChatSync } from "./chat-sync";

export function registerSyncModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    chatSyncFactory: asFunction((
      stateStore: StateStore,
      chatMessages: ChatMessages,
    ) =>
      (chatContainer: Container, requestRender: () => void): ChatSync =>
        new ChatSyncImpl(stateStore, chatMessages, chatContainer, requestRender)
    ).singleton(),
  });
}
