import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentUiState, type StateStore } from "../state";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, style } from "./themes";

export class TeamPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || !state.teamPanelVisible) return [];
    const agents = TuiState.rosterOrder(state);
    if (agents.length === 0) return [];
    const w = Math.max(1, width);
    const lines: string[] = [];
    for (const agent of agents) {
      const focused = agent.agentId === state.focusedAgentId;
      const pointer = focused ? style("accent")("▸") : " ";
      const mark = agent.isLeader ? `${style("accent")("★")} ` : "";
      const key = focused ? style("accent")(agent.agentKey) : agent.agentKey;
      lines.push(truncateToWidth(`${pointer} ${mark}${key} ${statusGlyph(agent)} ${style("muted")(statusDetail(agent))}`, w));
    }
    return lines;
  }

  invalidate(): void {}
}

function statusGlyph(agent: AgentUiState): string {
  if (agent.status === "busy") return style("accent")(spinnerFrame());
  if (agent.lastStopReason === "error") return style("error")("✗");
  return style("muted")("·");
}

function spinnerFrame(): string {
  return SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length];
}

function statusDetail(agent: AgentUiState): string {
  return agent.queue.length > 0 ? `${agent.role} · q${agent.queue.length}` : agent.role;
}
