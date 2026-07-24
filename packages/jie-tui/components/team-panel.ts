import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { type AgentId, type AgentUiState, type StateStore } from "../state";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, style } from "./themes";

export class TeamPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null) return [];
    const agents = rosterOrder(state.agents, state.leaderAgentId);
    if (agents.length === 0) return [];
    const w = Math.max(1, width);
    const lines: string[] = [];
    for (const agent of agents) {
      const mark = agent.isLeader ? style("accent")("★") : " ";
      const key = agent.agentId === state.focusedAgentId ? style("accent")(agent.agentKey) : agent.agentKey;
      lines.push(truncateToWidth(`${mark} ${key}`, w));
      lines.push(truncateToWidth(`  ${statusGlyph(agent)} ${style("muted")(statusDetail(agent))}`, w));
    }
    return lines;
  }

  invalidate(): void {}
}

function rosterOrder(agents: ReadonlyMap<AgentId, AgentUiState>, leaderAgentId: AgentId | null): AgentUiState[] {
  const all = [...agents.values()];
  const leader = all.filter((agent) => agent.agentId === leaderAgentId);
  const rest = all.filter((agent) => agent.agentId !== leaderAgentId);
  return [...leader, ...rest];
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
