import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { isDiffDetails, type ToolResultDetails } from "../../../platform";
import type { MessageCard, StateStore } from "../../state";
import { style } from "../themes";
import { diffStats } from "./diff-stats";
import { DiffView } from "./diff-view";
import { formatDuration } from "../elements";

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

const ARG_KEYS = new Map<string, ReadonlyArray<string>>([
  ["bash", ["command"]],
  ["read_file", ["path"]],
  ["write_file", ["path"]],
  ["edit_file", ["path"]],
  ["ls", ["path"]],
  ["find_file", ["pattern"]],
  ["grep_file", ["pattern"]],
  ["artifact", ["key", "pattern"]],
  ["web_search", ["query"]],
  ["web_fetch", ["url"]],
  ["memory", ["query", "content"]],
  ["update_kanban", ["content"]],
  ["notify", ["topic"]],
]);

function renderHeader(card: MessageCard, isError: boolean, width: number): string {
  const glyph = isError ? style("error")("✗") : style("success")("✓");
  const titleStyle = isError ? "error" : "toolTitle";
  const arg = formatToolArg(card.name, card.input, card.inputTruncated);
  const argPart = arg === "" ? "" : style("muted")(`(${arg})`);
  const hint = card.name === "write_file" || card.name === "edit_file" ? formatDiffHint(card.details) : "";
  const duration = card.durationMs !== undefined ? `  ${formatDuration(card.durationMs)}` : "";
  if (hint === "" && argPart === "") {
    return truncateToWidth(`${glyph} ${style(titleStyle)(`${card.name}${duration}`)}`, width);
  }
  const durationPart = duration === "" ? "" : style(titleStyle)(duration);
  const title = `${style(titleStyle)(card.name)}${argPart}${hint}${durationPart}`;
  return truncateToWidth(`${glyph} ${title}`, width);
}

function formatToolArg(name: string, input: string | undefined, inputTruncated: boolean | undefined): string {
  const keys = ARG_KEYS.get(name);
  if (keys === undefined || input === undefined || input === "") return "";
  try {
    const parsed: unknown = JSON.parse(input);
    if (!isRecord(parsed)) return "";
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value !== "string") continue;
      const firstLine = value.split("\n")[0] ?? "";
      if (firstLine === "") continue;
      return inputTruncated === true ? `${firstLine}…` : firstLine;
    }
    return "";
  } catch {
    return "";
  }
}

type DiffDetails = Extract<ToolResultDetails, { kind: "diff" }>;

function formatDiffHint(details: ToolResultDetails | null | undefined): string {
  if (!isDiffDetails(details)) return "";
  const diff = details.diff;
  if (diff === null || diff === "") {
    return fallbackDiffHint(details);
  }
  const stats = diffStats(diff);
  const parts: string[] = [];
  if (isEditDiffDetails(details) && details.replacementsCount > 0) {
    parts.push(`${details.replacementsCount} ${details.replacementsCount === 1 ? "replacement" : "replacements"}`);
  }
  if (stats.added > 0) parts.push(style("success")(`+${stats.added}`));
  if (stats.removed > 0) parts.push(style("error")(`-${stats.removed}`));
  if (parts.length === 0) return "";
  return ` ${parts.join(" ")}`;
}

function fallbackDiffHint(details: DiffDetails): string {
  if (isEditDiffDetails(details) && details.replacementsCount > 0) {
    return ` ${details.replacementsCount} ${details.replacementsCount === 1 ? "replacement" : "replacements"}`;
  }
  if (isWriteFileDiffDetails(details)) {
    return ` ${details.bytesWritten} bytes`;
  }
  return "";
}

function isEditDiffDetails(details: DiffDetails): details is Extract<ToolResultDetails, { kind: "diff"; replacementsCount: number }> {
  return "replacementsCount" in details;
}

function isWriteFileDiffDetails(details: DiffDetails): details is Extract<ToolResultDetails, { kind: "diff"; bytesWritten: number }> {
  return "bytesWritten" in details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
