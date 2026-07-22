import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { StateStore, TuiState } from "../state";
import { style } from "./themes";

export class KeyHints implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (hasConversation(this.stateStore.getState())) return [];
    return layoutHintLines(Math.max(1, width));
  }

  invalidate(): void {}
}

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["enter", "send"],
  ["tab", "complete"],
  ["@", "mention a file"],
  ["/", "commands"],
  ["ctrl+t", "thinking"],
  ["ctrl+o", "tool output"],
  ["shift+↑/↓", "switch agent"],
  ["esc", "interrupt"],
  ["ctrl+d", "quit"],
];

const SEPARATOR = " · ";

function layoutHintLines(width: number): string[] {
  const separator = style("muted")(SEPARATOR);
  const separatorWidth = visibleWidth(separator);
  const lines: string[] = [];
  let line = "";
  let lineWidth = 0;
  for (const [key, description] of HINTS) {
    const token = `${style("accent")(key)}${style("muted")(` ${description}`)}`;
    const tokenWidth = visibleWidth(token);
    if (line === "") {
      line = token;
      lineWidth = tokenWidth;
    } else if (lineWidth + separatorWidth + tokenWidth <= width) {
      line = `${line}${separator}${token}`;
      lineWidth += separatorWidth + tokenWidth;
    } else {
      lines.push(truncateToWidth(line, width));
      line = token;
      lineWidth = tokenWidth;
    }
  }
  if (line !== "") lines.push(truncateToWidth(line, width));
  return lines;
}

function hasConversation(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    if (agent.history.length > 0 || agent.currentTurn !== null) return true;
  }
  return false;
}
