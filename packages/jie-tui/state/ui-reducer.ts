import { ActionTypes, type Action } from "./actions";
import type { AgentId, AgentUiState, TuiState } from "./state";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SWITCH_TEAM:
      return applyTeamIdentity(state, action.payload.id, action.payload.agents);
    case ActionTypes.TOGGLE_TEAM_RAIL:
      return { ...state, showTeamRailPanel: !state.showTeamRailPanel };
    case ActionTypes.TOGGLE_THINKING:
      return { ...state, thinkingExpanded: !state.thinkingExpanded };
    case ActionTypes.TOGGLE_TOOL_CARDS:
      return { ...state, toolCardsExpanded: !state.toolCardsExpanded };
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceAgentCycle(state, action.payload.direction);
    case ActionTypes.CLEAR_TUI_STATE:
      return {
        ...state,
        agents: new Map(),
        leaderAgentId: null,
        focusedAgentId: null,
        transientMessage: null,
        errorBanner: null,
      };
    case ActionTypes.SET_TRANSIENT_MESSAGE:
      return { ...state, transientMessage: action.payload.text };
    case ActionTypes.CLEAR_TRANSIENT_MESSAGE:
      return { ...state, transientMessage: null };
    case ActionTypes.SET_ERROR_MESSAGE:
      return { ...state, errorBanner: action.payload.text };
    case ActionTypes.CLEAR_ERROR_MESSAGE:
      return { ...state, errorBanner: null };
    case ActionTypes.CLEAR_BANNERS:
      return { ...state, transientMessage: null, errorBanner: null };
    case ActionTypes.REQUEST_QUIT:
      if (state.pendingQuit) return state;
      return { ...state, pendingQuit: true };
    case ActionTypes.REQUEST_RENDER:
      return state;
    case ActionTypes.SET_EDITOR_TEXT:
      return { ...state, editorText: action.payload.text };
    case ActionTypes.SUBMIT_EDITOR_TEXT:
      return state;
    case ActionTypes.REQUEST_INTERRUPT:
      return state;
    case ActionTypes.SET_ENVIRONMENT:
      return {
        ...state,
        cwd: action.payload.cwd,
        gitBranch: action.payload.gitBranch,
        gitDirty: action.payload.gitDirty,
      };
    default:
      return state;
  }
}

function applyTeamIdentity(
  state: TuiState,
  teamId: string,
  agents: ReadonlyArray<{ readonly teamId: string; readonly role: string; readonly agentKey: string; readonly isLeader: boolean }>,
): TuiState {
  const newAgents = new Map(state.agents);
  let leaderId: AgentId | null = state.leaderAgentId;
  let focused: AgentId | null = state.focusedAgentId;
  if (state.teamId !== null && state.teamId !== teamId) {
    newAgents.clear();
    leaderId = null;
    focused = null;
  }
  const incomingIds = new Set<string>();
  for (const agent of agents) {
    const agentId = `${teamId}:${agent.agentKey}` as AgentId;
    incomingIds.add(agentId);
    const existing = newAgents.get(agentId);
    if (existing !== undefined) {
      newAgents.set(agentId, { ...existing, role: agent.role, isLeader: agent.isLeader });
    } else {
      newAgents.set(agentId, emptyAgent(agentId, teamId, agent.agentKey, agent.role, agent.isLeader));
    }
    if (agent.isLeader) leaderId = agentId;
  }
  for (const id of newAgents.keys()) {
    if (!incomingIds.has(id)) newAgents.delete(id);
  }
  if (focused !== null && !newAgents.has(focused)) focused = null;
  if (focused === null && leaderId !== null && newAgents.has(leaderId)) focused = leaderId;
  if (leaderId !== null && !newAgents.has(leaderId)) leaderId = null;
  return { ...state, teamId, leaderAgentId: leaderId, focusedAgentId: focused, agents: newAgents };
}

function emptyAgent(
  agentId: AgentId,
  teamId: string,
  agentKey: string,
  role: string,
  isLeader: boolean,
): AgentUiState {
  return {
    agentId,
    teamId,
    agentKey,
    role,
    isLeader,
    status: "idle",
    lastStopReason: null,
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
  };
}

function reduceAgentCycle(state: TuiState, direction: 1 | -1): TuiState {
  if (!state.showTeamRailPanel) return state;
  const ids = Array.from(state.agents.keys());
  if (ids.length < 2) return state;
  const length = ids.length;
  if (state.focusedAgentId === null) {
    const fallback = direction === 1 ? 0 : length - 1;
    return { ...state, focusedAgentId: ids[fallback]! };
  }
  const currentIndex = ids.indexOf(state.focusedAgentId);
  if (currentIndex === -1) return state;
  const next = (currentIndex + direction + length) % length;
  return { ...state, focusedAgentId: ids[next]! };
}
