import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { style } from "../themes";

export class DiffView implements Component {
  private readonly diff: string;

  constructor(diff: string) {
    this.diff = diff;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    if (this.diff === "") return [style("muted")("(no textual diff)")];
    const lines = numberDiffLines(parseDiff(this.diff));
    const numberWidth = lines.reduce((max, line) => line.number === null ? max : Math.max(max, String(line.number).length), 0);
    return lines.map((line) => truncateToWidth(renderLine(line, numberWidth), w));
  }

  invalidate(): void {}
}

interface DiffLine {
  readonly kind: "add" | "del" | "ctx" | "meta";
  readonly prefix: string;
  readonly text: string;
}

interface NumberedDiffLine extends DiffLine {
  readonly number: number | null;
}

function renderLine(line: NumberedDiffLine, numberWidth: number): string {
  const color = diffColor(line.kind);
  if (line.number === null) return style(color)(line.prefix + line.text);
  return style("muted")(`${String(line.number).padStart(numberWidth)} `) + style(color)(`${line.prefix} ${line.text}`);
}

function diffColor(kind: DiffLine["kind"]): "success" | "error" | "text" | "muted" {
  if (kind === "add") return "success";
  if (kind === "del") return "error";
  if (kind === "meta") return "muted";
  return "text";
}

function parseDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) out.push({ kind: "meta", prefix: "", text: raw });
    else if (raw.startsWith("+")) out.push({ kind: "add", prefix: "+", text: raw.substring(1) });
    else if (raw.startsWith("-")) out.push({ kind: "del", prefix: "-", text: raw.substring(1) });
    else if (raw.startsWith(" ")) out.push({ kind: "ctx", prefix: " ", text: raw.substring(1) });
    else out.push({ kind: "ctx", prefix: "", text: raw });
  }
  return out;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function numberDiffLines(lines: ReadonlyArray<DiffLine>): NumberedDiffLine[] {
  let oldLine: number | null = null;
  let newLine: number | null = null;
  const out: NumberedDiffLine[] = [];
  for (const line of lines) {
    const header = line.kind === "meta" ? HUNK_HEADER.exec(line.text) : null;
    if (header !== null) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      out.push({ ...line, number: null });
      continue;
    }
    if (line.prefix === "" || oldLine === null || newLine === null) {
      out.push({ ...line, number: null });
      continue;
    }
    if (line.kind === "del") {
      out.push({ ...line, number: oldLine });
      oldLine += 1;
      continue;
    }
    out.push({ ...line, number: newLine });
    newLine += 1;
    if (line.kind === "ctx") oldLine += 1;
  }
  return out;
}
