import { Container, Loader, type TUI } from "@earendil-works/pi-tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { StateStore } from "../state";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";
import { TodoList } from "./chat";
import { StatusLine } from "./status-line";
import { WelcomeBanner } from "./welcome-banner";
import { KeyHints } from "./key-hints";
import { Footer } from "./footer";
import { createJieEditor } from "./editor";

export interface TuiLayout {
  readonly chatContainer: Container;
  readonly workingSlot: Container;
  readonly workingIndicator: Loader;
}

export function composeLayout(tui: TUI, stateStore: StateStore, cwd: string, platform: JiePlatform): TuiLayout {
  const chatContainer = new Container();
  const editor = createJieEditor(tui, stateStore, cwd, platform);
  const workingSlot = new Container();
  const workingIndicator = new Loader(tui, style("accent"), style("muted"), WORKING_LABEL, { frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS });
  tui.addChild(chatContainer);
  tui.addChild(new TodoList(stateStore));
  tui.addChild(workingSlot);
  tui.addChild(new StatusLine(stateStore));
  tui.addChild(new WelcomeBanner(stateStore));
  tui.addChild(new KeyHints(stateStore));
  tui.addChild(editor);
  tui.addChild(new Footer(stateStore));
  tui.setFocus(editor);
  return { chatContainer, workingSlot, workingIndicator };
}
