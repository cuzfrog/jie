import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { AgentUiState, StateStore, TuiState } from "../state";
import { style } from "./themes";

export class WelcomeBanner implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (hasConversation(this.stateStore.getState())) return [];
    const w = Math.max(1, width);
    const lines: string[] = [`${style("accent")(WORDMARK)}${style("muted")(`  ${TAGLINE}`)}`];
    const team = teamLine(this.stateStore.getState());
    if (team !== null) lines.push(team);
    return lines.map((line) => truncateToWidth(line, w));
  }

  invalidate(): void {}
}

const WORDMARK = "jie";
const TAGLINE = "multi-agent coding, right in your terminal";
const ROSTER_SEPARATOR = " · ";

function teamLine(state: TuiState): string | null {
  if (state.teamId === null) return null;
  const roster = Array.from(state.agents.values(), describeAgent).join(ROSTER_SEPARATOR);
  const suffix = roster === "" ? "" : `${ROSTER_SEPARATOR}${roster}`;
  return `${style("accent")(`team ${state.teamId}`)}${style("muted")(suffix)}`;
}

function describeAgent(agent: AgentUiState): string {
  const leader = agent.isLeader ? " (leader)" : "";
  const model = agent.model === null ? "" : ` · ${agent.model.provider}/${agent.model.id}`;
  return `${agent.agentKey}${leader}${model}`;
}

function hasConversation(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    if (agent.history.length > 0 || agent.currentTurn !== null) return true;
  }
  return false;
}
