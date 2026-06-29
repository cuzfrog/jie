import { ActionTypes, type Action } from "./actions";
import type { MessageBlock, MessageCard, TuiState } from "./state";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.TOGGLE_TEAM_RAIL:
      return reduceRailToggle(state);
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceAgentCycle(state, action.payload.direction);
    case ActionTypes.TOGGLE_THINKING_BLOCK:
      return reduceThinkingToggle(state);
    case ActionTypes.TOGGLE_TOOL_CALL_BLOCK:
      return reduceToolToggle(state);
    case ActionTypes.CLEAR_TUI_STATE:
      return reduceClear(state);
    case ActionTypes.SET_TRANSIENT_MESSAGE:
      return reduceUiTransient(state, action.payload.text, action.payload.shownAt);
    case ActionTypes.CLEAR_TRANSIENT_MESSAGE:
      return reduceUiTransientClear(state);
    case ActionTypes.SET_ERROR_MESSAGE:
      return reduceUiError(state, action.payload.text, action.payload.shownAt);
    case ActionTypes.CLEAR_ERROR_MESSAGE:
      return reduceUiErrorClear(state);
    default:
      return state;
  }
}

function reduceRailToggle(state: TuiState): TuiState {
  return { ...state, showTeamRailPanel: !state.showTeamRailPanel };
}

function reduceAgentCycle(state: TuiState, direction: 1 | -1): TuiState {
  if (!state.showTeamRailPanel) return state;
  const ids = Array.from(state.agents.keys());
  if (ids.length < 2) return state;
  const currentIndex = state.focusedAgentId === null ? -1 : ids.indexOf(state.focusedAgentId);
  const length = ids.length;
  const next = ((currentIndex + direction) % length + length) % length;
  return { ...state, focusedAgentId: ids[next] ?? state.focusedAgentId };
}

function reduceThinkingToggle(state: TuiState): TuiState {
  if (state.focusedAgentId === null) return state;
  const agent = state.agents.get(state.focusedAgentId);
  if (agent === undefined) return state;
  const all = [...agent.history.flatMap((t) => t.blocks), ...(agent.currentTurn?.blocks ?? [])];
  const thinking = all.filter((b) => b.kind === "thinking");
  if (thinking.length === 0) return state;
  const allExpanded = thinking.every((b) => b.expanded);
  const target = !allExpanded;
  const flip = (b: MessageBlock): MessageBlock => (b.kind === "thinking" ? { ...b, expanded: target } : b);
  const newAgents = new Map(state.agents);
  newAgents.set(state.focusedAgentId, {
    ...agent,
    history: agent.history.map((t) => ({ ...t, blocks: t.blocks.map(flip) })),
    currentTurn: agent.currentTurn === null ? null : { ...agent.currentTurn, blocks: agent.currentTurn.blocks.map(flip) },
  });
  return { ...state, agents: newAgents };
}

function reduceToolToggle(state: TuiState): TuiState {
  if (state.focusedAgentId === null) return state;
  const agent = state.agents.get(state.focusedAgentId);
  if (agent === undefined) return state;
  const all = [...agent.history.flatMap((t) => t.cards), ...(agent.currentTurn?.cards ?? [])];
  if (all.length === 0) return state;
  const allExpanded = all.every((c) => c.expanded);
  const target = !allExpanded;
  const flip = (c: MessageCard): MessageCard => ({ ...c, expanded: target });
  const newAgents = new Map(state.agents);
  newAgents.set(state.focusedAgentId, {
    ...agent,
    history: agent.history.map((t) => ({ ...t, cards: t.cards.map(flip) })),
    currentTurn: agent.currentTurn === null ? null : { ...agent.currentTurn, cards: agent.currentTurn.cards.map(flip) },
  });
  return { ...state, agents: newAgents };
}

function reduceClear(state: TuiState): TuiState {
  return {
    ...state,
    agents: new Map(),
    leaderAgentId: null,
    focusedAgentId: null,
    transientMessage: null,
    errorBanner: null,
  };
}

function reduceUiTransient(state: TuiState, text: string, shownAt: number): TuiState {
  return { ...state, transientMessage: { text, shownAt } };
}

function reduceUiTransientClear(state: TuiState): TuiState {
  return { ...state, transientMessage: null };
}

function reduceUiError(state: TuiState, text: string, shownAt: number): TuiState {
  return { ...state, errorBanner: { text, raisedAt: shownAt } };
}

function reduceUiErrorClear(state: TuiState): TuiState {
  return { ...state, errorBanner: null };
}
