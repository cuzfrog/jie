import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageCard, StateStore } from "../../state";
import { style } from "../themes";
import { DiffView } from "./diff-view";

export class ToolCard implements Component {
  private readonly stateStore: StateStore;
  private card: MessageCard;
  private diffSource = "";
  private diffView: DiffView | null = null;

  constructor(card: MessageCard, stateStore: StateStore) {
    this.card = card;
    this.stateStore = stateStore;
  }

  update(card: MessageCard): void {
    this.card = card;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const card = this.card;
    const isError = card.error !== undefined && card.error !== null && card.error !== "";
    const headerColor = isError ? "error" : "toolTitle";
    const duration = card.durationMs !== undefined ? `  ${card.durationMs}ms` : "";
    const header = truncateToWidth(style(headerColor)(`${isError ? "✗" : "✓"} ${card.name}${duration}`), w);
    if (!this.stateStore.getState().toolCardsExpanded) return [header];
    const lines = [header];
    if (card.input !== undefined && card.input !== "") {
      lines.push(style("muted")("input:"));
      lines.push(...wrapTextWithAnsi(style("toolOutput")(card.input + (card.inputTruncated === true ? "…" : "")), w));
    }
    if (card.output !== undefined && card.output !== null && card.output !== "") {
      lines.push(style("muted")("output:"));
      lines.push(...wrapTextWithAnsi(style("toolOutput")(card.output + (card.outputTruncated === true ? "…" : "")), w));
    }
    const diff = extractDiff(card.details);
    if (diff !== null) {
      if (diff !== this.diffSource) {
        this.diffSource = diff;
        this.diffView = new DiffView(diff);
      }
      lines.push(style("muted")("diff:"));
      if (this.diffView !== null) lines.push(...this.diffView.render(w));
    }
    if (isError) lines.push(truncateToWidth(style("error")(`error: ${card.error ?? ""}`), w));
    return lines;
  }

  invalidate(): void {}
}

function extractDiff(details: MessageCard["details"]): string | null {
  if (typeof details !== "object" || details === null) return null;
  if (!("kind" in details) || details.kind !== "diff") return null;
  if (!("diff" in details) || typeof details.diff !== "string" || details.diff === "") return null;
  return details.diff;
}
