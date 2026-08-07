import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { style } from "./themes";

export function hintLines(width: number): string[] {
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

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["enter", "send"],
  ["tab", "complete"],
  ["@", "mention a file"],
  ["/", "commands"],
  ["ctrl+t", "thinking"],
  ["ctrl+o", "tool output"],
  ["ctrl+k", "kanban"],
  ["←", "team panel (cursor at start)"],
  ["esc", "interrupt"],
  ["ctrl+d", "quit"],
];

const SEPARATOR = " · ";
