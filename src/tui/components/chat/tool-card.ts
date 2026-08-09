import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageCard, StateStore } from "../../state";
import { style } from "../themes";
import { DiffView } from "./diff-view";
import { formatDuration } from "./format-duration";

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
    const expanded = this.stateStore.getState().toolCardsExpanded;
    const header = renderHeader(card, isError, w);
    const lines = [header];
    if (expanded && card.input !== undefined && card.input !== "") {
      lines.push(style("muted")("input:"));
      lines.push(...wrapTextWithAnsi(style("toolOutput")(card.input + (card.inputTruncated === true ? "…" : "")), w));
    }
    if (expanded && card.output !== undefined && card.output !== null && card.output !== "") {
      lines.push(style("muted")("output:"));
      lines.push(...wrapTextWithAnsi(style("toolOutput")(card.output + (card.outputTruncated === true ? "…" : "")), w));
    }
    const diff = extractDiff(card.details);
    if (diff !== null) {
      if (diff !== this.diffSource) {
        this.diffSource = diff;
        this.diffView = new DiffView(diff);
      }
      if (this.diffView !== null) lines.push(...this.diffView.render(w));
    }
    if (expanded && isError) lines.push(truncateToWidth(style("error")(`error: ${card.error ?? ""}`), w));
    return lines;
  }

  invalidate(): void {}
}

function extractDiff(details: MessageCard["details"]): string | null {
  if (details === null || details === undefined || !("kind" in details) || details.kind !== "diff") return null;
  return details.diff === null || details.diff === "" ? null : details.diff;
}

const ARG_KEYS = new Map<string, string>([
  ["bash", "command"],
  ["read_file", "path"],
  ["write_file", "path"],
  ["edit_file", "path"],
  ["ls", "path"],
  ["find_file", "pattern"],
  ["grep_file", "pattern"],
  ["read_artifact", "key"],
  ["write_artifact", "key"],
  ["find_artifact", "pattern"],
  ["web_search", "query"],
  ["web_fetch", "url"],
  ["memory_search", "query"],
  ["write_kanban", "id"],
  ["notify", "topic"],
]);

function renderHeader(card: MessageCard, isError: boolean, width: number): string {
  const glyph = isError ? style("error")("✗") : style("success")("✓");
  const titleStyle = isError ? "error" : "toolTitle";
  const arg = formatToolArg(card.name, card.input, card.inputTruncated);
  const argPart = arg === "" ? "" : style("muted")(`(${arg})`);
  const duration = card.durationMs !== undefined ? `  ${formatDuration(card.durationMs)}` : "";
  const title = argPart === "" ? style(titleStyle)(`${card.name}${duration}`) : style(titleStyle)(card.name) + argPart + style(titleStyle)(duration);
  return truncateToWidth(`${glyph} ${title}`, width);
}

function formatToolArg(name: string, input: string | undefined, inputTruncated: boolean | undefined): string {
  const key = ARG_KEYS.get(name);
  if (key === undefined || input === undefined || input === "") return "";
  try {
    const parsed: unknown = JSON.parse(input);
    if (!isRecord(parsed)) return "";
    const value = parsed[key];
    if (typeof value !== "string") return "";
    const firstLine = value.split("\n")[0] ?? "";
    if (firstLine === "") return "";
    return inputTruncated === true ? `${firstLine}…` : firstLine;
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
