import { tokenize } from "./tokenize";
import {
  TABLE_CELL_SEPARATOR,
  padTableCell,
  tableCellPadding,
  tableColumnWidths,
  tableRule,
  type TableBlock,
} from "./table";

function tableOf(source: string): TableBlock {
  const block = tokenize(source).find((b) => b.kind === "table");
  if (block === undefined) throw new Error("no table parsed");
  return block;
}

describe("tableColumnWidths", () => {
  test("each column width is the longest cell across header and rows", () => {
    const block = tableOf("| a | bb |\n| --- | --- |\n| cccc | d |");
    expect(tableColumnWidths(block)).toEqual([4, 2]);
  });

  test("columns are at least one wide", () => {
    const block = tableOf("|  | b |\n| --- | --- |\n|  |  |");
    expect(tableColumnWidths(block)).toEqual([1, 1]);
  });

  test("covers columns that only appear in body rows", () => {
    const block = tableOf("| a |\n| --- | --- |\n| x | yyy |");
    expect(tableColumnWidths(block)).toEqual([1, 3]);
  });
});

describe("tableRule", () => {
  test("one run of box-drawing chars per column joined by the cell separator", () => {
    expect(tableRule([3, 1])).toBe(`───${TABLE_CELL_SEPARATOR}─`);
  });
});

describe("padTableCell", () => {
  test("left and none alignment pad on the right", () => {
    expect(padTableCell("ab", 5, "left")).toBe("ab   ");
    expect(padTableCell("ab", 5, "none")).toBe("ab   ");
  });

  test("right alignment pads on the left", () => {
    expect(padTableCell("ab", 5, "right")).toBe("   ab");
  });

  test("center alignment splits the gap, extra space trailing", () => {
    expect(padTableCell("x", 4, "center")).toBe(" x  ");
    expect(padTableCell("x", 5, "center")).toBe("  x  ");
  });

  test("oversized cells are returned unchanged", () => {
    expect(padTableCell("abcdef", 3, "right")).toBe("abcdef");
  });
});

describe("tableCellPadding", () => {
  test("agrees with padTableCell for every alignment", () => {
    for (const align of ["left", "right", "center", "none"] as const) {
      const padding = tableCellPadding(2, 7, align);
      expect(padTableCell("ab", 7, align)).toBe(" ".repeat(padding.leading) + "ab" + " ".repeat(padding.trailing));
    }
  });
});
