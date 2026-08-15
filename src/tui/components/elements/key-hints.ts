import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { BUILTIN_SETUP_ASSISTANT_TEAM_ID } from "../../../platform";
import { style } from "../themes";

export interface KeyHints {
  lines(width: number): string[];
}

export class KeyHintsImpl implements KeyHints {
  lines(width: number): string[] {
    const w = Math.max(1, width);
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
      } else if (lineWidth + separatorWidth + tokenWidth <= w) {
        line = `${line}${separator}${token}`;
        lineWidth += separatorWidth + tokenWidth;
      } else {
        lines.push(truncateToWidth(line, w));
        line = token;
        lineWidth = tokenWidth;
      }
    }
    if (line !== "") lines.push(truncateToWidth(line, w));
    return lines;
  }
}

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["enter", "send"],
  ["tab", "complete"],
  ["@", "mention a file"],
  ["@@", "mention an ignored file"],
  ["/", "commands"],
  ["ctrl+t", "thinking"],
  ["ctrl+o", "tool output"],
  ["ctrl+k", "kanban"],
  ["←", "team panel"],
  ["esc", "interrupt"],
  ["ctrl+d", "quit"],
  ["/team " + BUILTIN_SETUP_ASSISTANT_TEAM_ID, "setup & help"],
];

const SEPARATOR = " · ";
