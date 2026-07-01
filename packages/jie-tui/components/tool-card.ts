import { Container, Text, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageCard } from "../state";

const TOOL_OUTPUT_MAX_LINES = 6;
const TOOL_INPUT_MAX_LINES = 4;

export class ToolCard implements Component {
  private readonly container: Container;
  private card: MessageCard | null;
  private cachedLines: string[] | null = null;
  private cachedWidth = -1;

  constructor() {
    this.container = new Container();
    this.card = null;
  }

  setCard(card: MessageCard): void {
    this.card = card;
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (this.cachedLines !== null && this.cachedWidth === width) {
      return this.cachedLines;
    }
    this.cachedWidth = width;
    this.rebuildChildren(width);
    this.cachedLines = this.container.render(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedLines = null;
    this.container.invalidate();
  }

  private rebuildChildren(width: number): void {
    this.container.clear();
    if (this.card === null) return;
    const card = this.card;
    this.container.addChild(new Text(this.headerLine(card)));
    if (card.kind === "toolCall") {
      const inputText = card.input ?? "";
      if (inputText.length > 0) {
        for (const line of this.truncatedBodyLines(inputText, width - 2, TOOL_INPUT_MAX_LINES)) {
          this.container.addChild(new Text("  " + line));
        }
      }
    } else {
      if (card.output !== null && card.output !== undefined && card.output.length > 0) {
        for (const line of this.truncatedBodyLines(card.output, width - 2, TOOL_OUTPUT_MAX_LINES)) {
          this.container.addChild(new Text("  " + line));
        }
      }
      if (card.error !== null && card.error !== undefined && card.error.length > 0) {
        for (const line of this.truncatedBodyLines(card.error, width - 2, TOOL_OUTPUT_MAX_LINES)) {
          this.container.addChild(new Text("  " + line));
        }
      }
    }
  }

  private headerLine(card: MessageCard): string {
    if (card.kind === "toolCall") {
      return `● ${card.name}`;
    }
    const ok = card.error === null || card.error === undefined;
    const glyph = ok ? "✓" : "✗";
    const ms = card.durationMs !== undefined ? `  ${card.durationMs}ms` : "";
    return `${glyph} ${card.name}${ms}`;
  }

  private truncatedBodyLines(text: string, width: number, maxLines: number): string[] {
    const safeWidth = Math.max(1, width);
    const wrapped = wrapTextWithAnsi(text, safeWidth);
    if (wrapped.length <= maxLines) return wrapped;
    return [...wrapped.slice(0, maxLines - 1), `… (${wrapped.length - maxLines + 1} more lines)`];
  }
}
