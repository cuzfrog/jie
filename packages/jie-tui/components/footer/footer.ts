import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { ModelInfo } from "@cuzfrog/jie-platform";
import { TuiState, type AgentUiState, type StateStore } from "../../state";
import { formatQueueIndicator, style } from "../themes";
import { contextPercentColor, formatContextPercent } from "./context-percent";

export class Footer implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    const focused = TuiState.getFocusedAgent(state);
    const w = Math.max(1, width);
    const branch = state.gitBranch !== null && state.gitBranch !== "" ? state.gitBranch : "main";
    const identity = style("accent")(`${state.cwd ?? ""} (${branch}${state.gitDirty ? "*" : ""})`);
    const teamAgent = style("muted")(`${state.teamId ?? "no-team"}:${focused === null ? "—" : focused.agentKey}`);
    const stats: string[] = [style(contextSegmentColor(focused))(contextSegmentText(focused))];
    const queue = formatQueueIndicator(focused === null ? null : focused.queue);
    if (queue !== null) stats.push(style("warning")(queue));
    const model = modelSegment(focused === null ? null : focused.model);
    return [rightAligned(identity, teamAgent, w), rightAligned(stats.join("  "), model, w)];
  }

  invalidate(): void {}
}

function modelSegment(model: ModelInfo | null): string {
  if (model === null) return style("muted")("—");
  return `${style("muted")(`(${model.provider}) `)}${style("accent")(model.id)}${style("muted")(` | ${model.effort}`)}`;
}

function contextSegmentText(focused: AgentUiState | null): string {
  if (focused === null || focused.model === null) return "—";
  return formatContextPercent(focused.contextTokensUsed, focused.model.contextWindow);
}

function contextSegmentColor(focused: AgentUiState | null): "muted" | "warning" | "error" {
  if (focused === null || focused.model === null) return "muted";
  return contextPercentColor(focused.contextTokensUsed, focused.model.contextWindow);
}

const MIN_GAP = 2;

function rightAligned(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + MIN_GAP + rightWidth <= width) {
    return left + " ".repeat(width - leftWidth - rightWidth) + right;
  }
  const available = width - leftWidth - MIN_GAP;
  if (available <= 0) return truncateToWidth(left, width);
  const truncatedRight = truncateToWidth(right, available);
  return left + " ".repeat(Math.max(0, width - leftWidth - visibleWidth(truncatedRight))) + truncatedRight;
}
