import type { Component } from "@earendil-works/pi-tui";

export class Row implements Component {
  private readonly children: Component[];
  private readonly widths: number[];

  constructor(widths: number[], children: Component[]) {
    this.widths = widths;
    this.children = children;
  }

  render(_width: number): string[] {
    const parts: string[][] = this.children.map((child, i) => {
      const w = this.widths[i] ?? 0;
      return child.render(Math.max(1, w));
    });
    const height = parts.reduce((acc, p) => Math.max(acc, p.length), 0);
    const out: string[] = [];
    for (let r = 0; r < height; r++) {
      let line = "";
      for (let i = 0; i < this.children.length; i++) {
        const cellLines = parts[i] ?? [];
        const cellLine = cellLines[r] ?? "";
        line += cellLine;
      }
      out.push(line);
    }
    return out;
  }

  invalidate(): void {
    for (const child of this.children) child.invalidate?.();
  }
}
