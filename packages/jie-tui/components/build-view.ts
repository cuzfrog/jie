import { Container, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import type { TuiState } from "../state";
import type { GitSnapshot } from "../git-service";
import { StatusBar } from "./status-bar";
import { AgentsRail } from "./agents-rail";
import { ChatPane, chatPaneFromAgent } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { ConfirmExitOverlay } from "./confirm-exit-overlay";

export interface BuildViewOpts {
  cwd: string;
  git: GitSnapshot;
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
  statusBar.setFromOptsAndState(opts, state);

  const rail = new AgentsRail();
  rail.setItemsFromState(state);

  const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId) ?? null;
  const chatPane = chatPaneFromAgent(focused);

  const editor = new EditorSlot(tui, { basePath: opts.cwd });
  editor.setText("");
  editor.setQueueIndicator(queueIndicatorText(focused?.queue ?? null));

  const confirmExit = new ConfirmExitOverlay();
  confirmExit.setVisible(state.pendingQuit);

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

const QUEUE_PREVIEW_MAX_CHARS = 100;

function queueIndicatorText(queue: ReadonlyArray<string> | null): string | null {
  if (queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = next.length > QUEUE_PREVIEW_MAX_CHARS ? `${next.slice(0, QUEUE_PREVIEW_MAX_CHARS)}…` : next;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${preview}`;
}
