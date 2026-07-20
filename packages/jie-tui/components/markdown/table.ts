import type { InlineRun, MarkdownBlock, TableCellAlign } from "./tokenize";
import { runsText } from "./tokenize";

export type TableBlock = Extract<MarkdownBlock, { kind: "table" }>;

export interface TableCellPadding {
  readonly leading: number;
  readonly trailing: number;
}

export const TABLE_CELL_SEPARATOR = "  |  ";

export function tableColumnWidths(block: TableBlock): ReadonlyArray<number> {
  let columnCount = block.headerRuns.length;
  for (const row of block.rowRuns) columnCount = Math.max(columnCount, row.length);
  const widths: number[] = [];
  for (let j = 0; j < columnCount; j++) {
    let width = 0;
    const headerCell = block.headerRuns[j];
    if (headerCell !== undefined) width = Math.max(width, runsText(headerCell).length);
    for (const row of block.rowRuns) {
      const cell = row[j];
      if (cell !== undefined) width = Math.max(width, runsText(cell).length);
    }
    widths.push(Math.max(1, width));
  }
  return widths;
}

export function tableRule(widths: ReadonlyArray<number>): string {
  return widths.map((width) => "─".repeat(width)).join(TABLE_CELL_SEPARATOR);
}

export function padTableCell(text: string, width: number, align: TableCellAlign): string {
  const padding = tableCellPadding(text.length, width, align);
  return " ".repeat(padding.leading) + text + " ".repeat(padding.trailing);
}

export function tableCellPadding(textLength: number, width: number, align: TableCellAlign): TableCellPadding {
  const gap = Math.max(0, width - textLength);
  if (align === "right") return { leading: gap, trailing: 0 };
  if (align === "center") {
    const leading = Math.floor(gap / 2);
    return { leading, trailing: gap - leading };
  }
  return { leading: 0, trailing: gap };
}

export function tableRowText(
  cells: ReadonlyArray<ReadonlyArray<InlineRun>>,
  widths: ReadonlyArray<number>,
  aligns: ReadonlyArray<TableCellAlign>,
): string {
  return cells.map((cell, j) => padTableCell(runsText(cell), widths[j] ?? 0, aligns[j] ?? "none")).join(TABLE_CELL_SEPARATOR);
}
