import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentUiState, type StateStore } from "../state";
import { style } from "./themes";

export class WelcomeBanner implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (TuiState.hasConversation(this.stateStore.getState())) return [];
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
