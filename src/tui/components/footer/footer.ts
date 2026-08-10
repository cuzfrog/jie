import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TuiState, type AgentUiState, type StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { style } from "../themes";
import { contextPercentColor, formatContextPercent, formatModelSegment } from "../elements";
import { formatQueueIndicator } from "./queue-indicator";

export class Footer implements TuiComponent {
  private readonly stateStore: StateStore;
  private focused: AgentUiState | null = null;
  private gitBranch: string | null = null;
  private gitDirty = false;
  private cwd: string | null = null;
  private teamId: string | null = null;
  private helpPanelVisible = false;
  private teamPanelVisible = false;
  private kanbanView: "hidden" | "list" | "panel" = "hidden";
  private editorCursorAtStart = false;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  update(): boolean {
    const state = this.stateStore.getState();
    const focused = TuiState.getFocusedAgent(state);
    if (
      focused === this.focused &&
      state.gitBranch === this.gitBranch &&
      state.gitDirty === this.gitDirty &&
      state.cwd === this.cwd &&
      state.teamId === this.teamId &&
      state.helpPanelVisible === this.helpPanelVisible &&
      state.teamPanelVisible === this.teamPanelVisible &&
      state.kanbanView === this.kanbanView &&
      state.editorCursorAtStart === this.editorCursorAtStart
    ) return false;
    this.focused = focused;
    this.gitBranch = state.gitBranch;
    this.gitDirty = state.gitDirty;
    this.cwd = state.cwd;
    this.teamId = state.teamId;
    this.helpPanelVisible = state.helpPanelVisible;
    this.teamPanelVisible = state.teamPanelVisible;
    this.kanbanView = state.kanbanView;
    this.editorCursorAtStart = state.editorCursorAtStart;
    return true;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    const focused = TuiState.getFocusedAgent(state);
    const w = Math.max(1, width);
    const branch = state.gitBranch !== null && state.gitBranch !== "" ? state.gitBranch : "main";
    const identity = style("accent")(`${state.cwd ?? ""} (${branch}${state.gitDirty ? "*" : ""})`);
    const teamAgent = style("muted")(`${state.teamId ?? "no-team"}:${focused === null ? "—" : focused.agentKey}`);
    const identityLine = rightAligned(identity, teamAgent, w);
    if (state.helpPanelVisible || (state.teamId !== null && (state.teamPanelVisible || state.kanbanView === "panel"))) return [identityLine];
    const stats: string[] = [style(contextSegmentColor(focused))(contextSegmentText(focused))];
    const queue = formatQueueIndicator(focused === null ? null : focused.queue);
    if (queue !== null) stats.push(style("warning")(queue));
    if (focused !== null && focused.compactionInProgress) stats.push(style("warning")("Compacting..."));
    stats.push(footerHelpInfo(state));
    const modelInfo = focused === null ? null : focused.model;
    const model = modelInfo === null ? style("muted")("—") : formatModelSegment(modelInfo);
    return [identityLine, rightAligned(stats.join("  "), model, w)];
  }

  invalidate(): void {}
}

function footerHelpInfo(state: TuiState): string {
  if (state.teamId !== null && state.editorCursorAtStart) {
    return `${style("accent")("←")}${style("muted")(" to toggle team panel")}`;
  }
  return `${style("accent")("/help")}${style("muted")(" to show commands and shortcuts")}`;
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
