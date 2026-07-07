import { Container, Text, type TUI } from "@earendil-works/pi-tui";
import type { StateStore } from "../state";
import { Footer } from "./footer";
import { AgentsRail } from "./agents-rail";
import { ChatPane, chatPaneFromAgent } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { Row } from "./row";
import { Themes } from "./themes";
import type { Component } from "@earendil-works/pi-tui";

export interface BuildViewOpts {
  readonly cwd: string;
}

export interface BuildViewResult {
  readonly root: Container;
  readonly rail: AgentsRail;
  readonly chatPane: ChatPane;
  readonly editor: EditorSlot;
  readonly footer: Footer;
}

export function buildView(stateStore: StateStore, opts: BuildViewOpts, tui: TUI): BuildViewResult {
  const state = stateStore.getState();
  const footer = new Footer(tui);

  const rail = new AgentsRail();
  rail.setItemsFromState(state);

  const focused = stateStore.getFocusedAgent();
  const chatPane = chatPaneFromAgent(focused);

  const editor = new EditorSlot(tui, { basePath: opts.cwd });
  editor.bindState(stateStore);

  const cols = tui.terminal.columns;
  const showRail = state.showTeamRailPanel;

  const body: Component = showRail
    ? new Row(
        [railCols(cols), 1, Math.max(1, cols - railCols(cols) - 1)],
        [rail, verticalSeparator(), chatPane],
      )
    : chatPane;

  const root = new Container();
  root.addChild(body);
  root.addChild(horizontalBorder(cols));
  root.addChild(editor);
  root.addChild(horizontalBorder(cols));
  root.addChild(footer);

  const editorLines = Math.max(5, Math.floor(tui.terminal.rows * 0.3)) + 2;
  const bodyRows = Math.max(0, tui.terminal.rows - editorLines - 2 - 2);
  chatPane.setViewportHeight(bodyRows);

  return { root, rail, chatPane, editor, footer };
}

function horizontalBorder(width: number): Text {
  return new Text(Themes.editorTheme.borderColor("─".repeat(width)));
}

function verticalSeparator(): Text {
  return new Text(Themes.editorTheme.borderColor("│"));
}

function railCols(cols: number): number {
  if (cols < 80) return Math.max(12, Math.floor(cols * 0.25));
  return 20;
}
