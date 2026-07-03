import { Container, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import type { StateStore } from "../state";
import { StatusBar } from "./status-bar";
import { AgentsRail } from "./agents-rail";
import { ChatPane, chatPaneFromAgent } from "./chat-pane";
import { EditorSlot } from "./editor-slot";

export interface BuildViewOpts {
  readonly cwd: string;
}

export interface BuildViewResult {
  readonly root: Container;
  readonly rail: AgentsRail;
  readonly chatPane: ChatPane;
  readonly editor: EditorSlot;
  readonly statusBar: StatusBar;
}

export function buildView(stateStore: StateStore, opts: BuildViewOpts, tui: TUI): BuildViewResult {
  const statusBar = new StatusBar(tui);

  const state = stateStore.getState();
  const rail = new AgentsRail();
  rail.setItemsFromState(state);

  const focused = stateStore.getFocusedAgent();
  const chatPane = chatPaneFromAgent(focused);

  const editor = new EditorSlot(tui, { basePath: opts.cwd });

  const root = new Container();
  root.addChild(rail);
  root.addChild(new Spacer(1));
  root.addChild(chatPane);
  root.addChild(new Spacer(1));
  root.addChild(editor);
  root.addChild(new Spacer(1));
  root.addChild(statusBar);
  root.addChild(new Spacer(1));
  root.addChild(new Text(""));

  return { root, rail, chatPane, editor, statusBar };
}
