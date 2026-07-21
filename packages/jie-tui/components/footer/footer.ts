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
    const left = style("accent")(`${state.cwd ?? ""} (${branch}${state.gitDirty ? "*" : ""})`);
    const right = style("muted")(`${state.teamId ?? "no-team"}:${focused === null ? "—" : focused.agentKey}`);
    const gap = Math.max(1, w - visibleWidth(left) - visibleWidth(right));
    const line1 = truncateToWidth(`${left}${" ".repeat(gap)}${right}`, w);
    const segments: string[] = [
      style(contextSegmentColor(focused))(contextSegmentText(focused)),
    ];
    const queue = formatQueueIndicator(focused === null ? null : focused.queue);
    if (queue !== null) segments.push(style("warning")(queue));
    segments.push(style("muted")(modelSegmentText(focused === null ? null : focused.model)));
    return [line1, truncateToWidth(segments.join("  "), w)];
  }

  invalidate(): void {}
}

function modelSegmentText(model: ModelInfo | null): string {
  if (model === null) return "—";
  return `(${model.provider}) ${model.id} | ${model.effort}`;
}

function contextSegmentText(focused: AgentUiState | null): string {
  if (focused === null || focused.model === null) return "—";
  return formatContextPercent(focused.contextTokensUsed, focused.model.contextWindow);
}

function contextSegmentColor(focused: AgentUiState | null): "muted" | "warning" | "error" {
  if (focused === null || focused.model === null) return "muted";
  return contextPercentColor(focused.contextTokensUsed, focused.model.contextWindow);
}
