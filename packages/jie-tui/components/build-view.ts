import { Container, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import type { TuiState } from "../state";
import { StatusBar, statusBarContextFromState, statusBarModelFromOpts } from "./status-bar";
import { AgentsRail, projectRailItems } from "./agents-rail";
import { ChatPane, chatPaneFromAgent } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { ConfirmExitOverlay } from "./confirm-exit-overlay";

export interface BuildViewOpts {
  cwd: string;
  branch: string;
  provider: string;
  modelId: string;
  effort: string;
}

export interface BuildViewResult {
  readonly root: Container;
  readonly rail: AgentsRail;
  readonly chatPane: ChatPane;
  readonly editor: EditorSlot;
  readonly statusBar: StatusBar;
  readonly confirmExit: ConfirmExitOverlay;
}

export function buildView(state: TuiState, opts: BuildViewOpts, tui: TUI): BuildViewResult {
  const statusBar = new StatusBar(tui);
  statusBar.setModel(statusBarModelFromOpts(opts), statusBarContextFromState(state));

  const rail = new AgentsRail();
  rail.setItems(projectRailItems(state.agents), state.focusedAgentId);

  const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId) ?? null;
  const chatPane = chatPaneFromAgent(focused);

  const editor = new EditorSlot(tui, { basePath: opts.cwd });
  editor.setText("");

  const confirmExit = new ConfirmExitOverlay();

  const root = new Container();
  root.addChild(rail);
  root.addChild(new Spacer(1));
  root.addChild(chatPane);
  root.addChild(new Spacer(1));
  root.addChild(editor);
  root.addChild(new Spacer(1));
  root.addChild(statusBar);
  root.addChild(new Spacer(1));
  root.addChild(confirmExit);
  root.addChild(new Text(""));

  return { root, rail, chatPane, editor, statusBar, confirmExit };
}
