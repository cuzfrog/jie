import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { style } from "../themes";

export interface BoxOptions {
  readonly top?: string;
  readonly bottom?: string;
}

export class Box implements Component {
  private readonly lines: ReadonlyArray<string>;
  private readonly options: BoxOptions;

  constructor(lines: ReadonlyArray<string>, options: BoxOptions = {}) {
    this.lines = lines;
    this.options = options;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 4);
    const border = style("borderMuted");
    const horizontal = "─".repeat(Math.max(0, w - 2));
    const top = this.options.top ?? border(`┌${horizontal}┐`);
    const bottom = this.options.bottom ?? border(`└${horizontal}┘`);
    const framed = this.lines.map((line) => {
      const padded = truncateToWidth(line, inner, "", true);
      return truncateToWidth(`${border("│")} ${padded} ${border("│")}`, w);
    });
    return [truncateToWidth(top, w), ...framed, truncateToWidth(bottom, w)];
  }

  invalidate(): void {}
}

