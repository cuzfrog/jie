import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TuiState, type AgentUiState, type StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { type CompactingIndicator, type ModelSegment, type TokenUsage } from "../elements";
import { style } from "../themes";
import { type QueueIndicator } from "./queue-indicator";

export class Footer implements TuiComponent {
  private readonly stateStore: StateStore;
  private readonly tokenUsage: TokenUsage;
  private readonly modelSegment: ModelSegment;
  private readonly queueIndicator: QueueIndicator;
  private readonly compactingIndicator: CompactingIndicator;
  private focused: AgentUiState | null = null;
  private gitBranch: string | null = null;
  private gitDirty = false;
  private cwd: string | null = null;
  private teamId: string | null = null;
  private helpPanelVisible = false;
  private teamPanelVisible = false;
  private kanbanView: TuiState["kanban"]["view"] = "hidden";
  private editorCursorAtStart = false;

  constructor(stateStore: StateStore, tokenUsage: TokenUsage, modelSegment: ModelSegment, queueIndicator: QueueIndicator, compactingIndicator: CompactingIndicator) {
    this.stateStore = stateStore;
    this.tokenUsage = tokenUsage;
    this.modelSegment = modelSegment;
    this.queueIndicator = queueIndicator;
    this.compactingIndicator = compactingIndicator;
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
      state.kanban.view === this.kanbanView &&
      state.editorCursorAtStart === this.editorCursorAtStart
    ) return false;
    this.focused = focused;
    this.gitBranch = state.gitBranch;
    this.gitDirty = state.gitDirty;
    this.cwd = state.cwd;
    this.teamId = state.teamId;
    this.helpPanelVisible = state.helpPanelVisible;
    this.teamPanelVisible = state.teamPanelVisible;
    this.kanbanView = state.kanban.view;
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
    if (state.helpPanelVisible || (state.teamId !== null && (state.teamPanelVisible || state.kanban.view === "panel"))) return [identityLine];
    const stats: string[] = [this.tokenUsage.format(focused)];
    const queue = this.queueIndicator.format(focused === null ? null : focused.queue);
    if (queue !== null) stats.push(style("warning")(queue));
    const compacting = this.compactingIndicator.format(focused);
    if (compacting !== null) stats.push(compacting);
    stats.push(footerHelpInfo(state));
    const modelInfo = focused === null ? null : focused.model;
    const model = modelInfo === null ? style("muted")("—") : this.modelSegment.format(modelInfo);
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
