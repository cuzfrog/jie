import wrapAnsi from "wrap-ansi";
import { tokenize, type InlineRun, type MarkdownBlock } from "./tokenize";

/**
Terminal rows `<Markdown source={source}>` will paint at the given width.
Assembles the exact string each node squashes into a single `<Text>` (see
`render.tsx`) and counts rows with the same `wrap-ansi` call the renderer
uses, so virtual-scroll accounting matches the paint and the negative-margin
clip in chat rendering stays honest. `firstPrefix` is the leading text only
the first block's paragraph/heading node renders.
*/
export function measureMarkdown(source: string, width: number, firstPrefix: string = ""): number {
  const blocks = tokenize(source);
  let total = 0;
  let first = true;
  for (const block of blocks) {
    total += measureBlock(block, width, first ? firstPrefix : "");
    first = false;
  }
  return total;
}

function measureBlock(block: MarkdownBlock, width: number, prefix: string): number {
  switch (block.kind) {
    case "paragraph":
      return rowsFor(prefix + runsText(block.runs), width);
    case "heading":
      return rowsFor(prefix + "#".repeat(block.level) + " " + runsText(block.runs), width);
    case "codeBlock":
      return measureCodeBlock(block, width);
    case "blockquote":
      return rowsFor("│ " + runsText(block.runs), width);
    case "hr":
      return rowsFor("─".repeat(HR_RULE_COLS), width);
    case "list":
      return measureList(block, width);
    case "table":
      return measureTable(block, width);
  }
}

function measureCodeBlock(block: Extract<MarkdownBlock, { kind: "codeBlock" }>, width: number): number {
  const inner = Math.max(1, width - CODE_PADDING_COLS);
  let rows = block.lang !== null ? rowsFor("  " + block.lang, inner) : 0;
  for (const line of block.text.split("\n")) {
    rows += rowsFor("  " + line, inner);
  }
  return rows;
}

function measureList(block: Extract<MarkdownBlock, { kind: "list" }>, width: number): number {
  let rows = 0;
  block.items.forEach((_item, i) => {
    const bullet = block.ordered ? `${i + 1}. ` : "- ";
    rows += rowsFor(bullet + runsText(block.itemRuns[i] ?? []), width);
    for (const childRuns of block.childrenRuns[i] ?? []) {
      rows += rowsFor("- " + runsText(childRuns), Math.max(1, width - CHILD_LIST_INDENT));
    }
  });
  return rows;
}

function measureTable(block: Extract<MarkdownBlock, { kind: "table" }>, width: number): number {
  let rows = rowsFor(block.headerRuns.map((cell) => runsText(cell)).join(TABLE_CELL_SEP), width);
  rows += rowsFor("─".repeat(block.headerRuns.length * 4 + 12), width);
  for (const rowRuns of block.rowRuns) {
    rows += rowsFor(rowRuns.map((cell) => runsText(cell)).join(TABLE_CELL_SEP), width);
  }
  return rows;
}

function rowsFor(text: string, width: number): number {
  if (text.length === 0) return 0;
  return wrapAnsi(text, Math.max(1, width), { trim: false, hard: true }).split("\n").length;
}

function runsText(runs: ReadonlyArray<InlineRun>): string {
  return runs.map((run) => (run.br === true ? "\n" : run.text)).join("");
}

const HR_RULE_COLS = 40;
const CODE_PADDING_COLS = 2;
const CHILD_LIST_INDENT = 2;
const TABLE_CELL_SEP = "  |  ";
