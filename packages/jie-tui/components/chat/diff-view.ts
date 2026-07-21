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
    return parseDiff(this.diff).map((line) => truncateToWidth(style(diffColor(line.kind))(line.prefix + line.text), w));
  }

  invalidate(): void {}
}

interface DiffLine {
  readonly kind: "add" | "del" | "ctx" | "meta";
  readonly prefix: string;
  readonly text: string;
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
