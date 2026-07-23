import { asFunction, type AwilixContainer } from "awilix";
import type { Component, Container, Editor, TUI } from "@earendil-works/pi-tui";
import type { StateStore } from "../state";
import type { ChatSync } from "../sync";
import type { TuiCradle } from "../container";
import { TuiViewImpl, type TuiView } from "./view";

export function registerComponentsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    viewFactory: asFunction((
      stateStore: StateStore,
      chatSyncFactory: (chatContainer: Container, requestRender: () => void) => ChatSync,
      todoList: Component,
      footer: Component,
      jieEditorFactory: (tui: TUI) => Editor,
    ) =>
      (tui: TUI): TuiView => new TuiViewImpl(tui, stateStore, chatSyncFactory, todoList, footer, jieEditorFactory)
    ).singleton(),
  });
}
