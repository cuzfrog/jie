import { Container, Loader, type Component, type Editor, type TUI } from "@earendil-works/pi-tui";
import type { StateStore } from "../state";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";
import { StatusLine } from "./status-line";
import { WelcomeBanner } from "./welcome-banner";
import { KeyHints } from "./key-hints";

export interface TuiLayout {
  readonly chatContainer: Container;
  readonly workingSlot: Container;
  readonly workingIndicator: Loader;
}

export function composeLayout(
  tui: TUI,
  stateStore: StateStore,
  todoList: Component,
  footer: Component,
  jieEditorFactory: (tui: TUI) => Editor,
): TuiLayout {
  const chatContainer = new Container();
  const editor = jieEditorFactory(tui);
  const workingSlot = new Container();
  const workingIndicator = new Loader(tui, style("accent"), style("muted"), WORKING_LABEL, { frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS });
  tui.addChild(chatContainer);
  tui.addChild(todoList);
  tui.addChild(workingSlot);
  tui.addChild(new StatusLine(stateStore));
  tui.addChild(new WelcomeBanner(stateStore));
  tui.addChild(new KeyHints(stateStore));
  tui.addChild(editor);
  tui.addChild(footer);
  tui.setFocus(editor);
  return { chatContainer, workingSlot, workingIndicator };
}
