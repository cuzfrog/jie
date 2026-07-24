import { visibleWidth, type Component } from "@earendil-works/pi-tui";
import { style } from "./themes";

export class SplitPane implements Component {
  private readonly left: Component;
  private readonly right: Component;
  private readonly leftWidth: (totalWidth: number) => number | null;
  private readonly separator = style("borderMuted")("│");

  constructor(left: Component, right: Component, leftWidth: (totalWidth: number) => number | null) {
    this.left = left;
    this.right = right;
    this.leftWidth = leftWidth;
  }

  render(width: number): string[] {
    const totalWidth = Math.max(1, width);
    const leftWidth = this.leftWidth(totalWidth);
    if (leftWidth === null) return this.right.render(totalWidth);
    const leftLines = this.left.render(leftWidth);
    const rightLines = this.right.render(totalWidth - leftWidth - 1);
    const height = Math.max(leftLines.length, rightLines.length);
    const lines: string[] = [];
    for (let i = 0; i < height; i++) {
      const leftLine = leftLines[i] ?? "";
      const rightLine = rightLines[i] ?? "";
      lines.push(`${leftLine}${" ".repeat(Math.max(0, leftWidth - visibleWidth(leftLine)))}${this.separator}${rightLine}`);
    }
    return lines;
  }

  invalidate(): void {
    this.left.invalidate();
    this.right.invalidate();
  }
}

const PANEL_WIDTH_AT_80_COLS_OR_MORE = 24;
const MIN_PANEL_WIDTH = 12;
const MIN_MAIN_WIDTH = 20;

export function panelWidth(columns: number): number | null {
  const width = columns >= 80 ? PANEL_WIDTH_AT_80_COLS_OR_MORE : Math.max(MIN_PANEL_WIDTH, Math.floor(columns * 0.25));
  return columns - width - 1 >= MIN_MAIN_WIDTH ? width : null;
}
