import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { Block, Card, TuiState } from "./state";

interface TransientWirePayload {
  text: string;
  shownAt: number;
}

interface UiCycleWirePayload {
  direction?: number;
}

export const reduceRailToggle = (state: TuiState): TuiState => ({ ...state, showRail: !state.showRail });

export const reduceAgentCycle = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!state.showRail) return state;
  const ids = Array.from(state.agents.keys());
  if (ids.length < 2) return state;
  const direction = (env.payload as unknown as UiCycleWirePayload | null)?.direction ?? 1;
  const currentIndex = state.focusedAgentId === null ? -1 : ids.indexOf(state.focusedAgentId);
  const next = ((currentIndex + direction + ids.length) % ids.length + ids.length) % ids.length;
  return { ...state, focusedAgentId: ids[next] ?? state.focusedAgentId };
};

export const reduceThinkingToggle = (state: TuiState): TuiState => {
  if (state.focusedAgentId === null) return state;
  const agent = state.agents.get(state.focusedAgentId);
  if (agent === undefined) return state;
  const all = [...agent.history.flatMap((t) => t.blocks), ...(agent.currentTurn?.blocks ?? [])];
  const thinking = all.filter((b) => b.kind === "thinking");
  if (thinking.length === 0) return state;
  const allExpanded = thinking.every((b) => b.expanded);
  const target = !allExpanded;
  const flip = (b: Block): Block => (b.kind === "thinking" ? { ...b, expanded: target } : b);
  const newAgents = new Map(state.agents);
  newAgents.set(state.focusedAgentId, {
    ...agent,
    history: agent.history.map((t) => ({ ...t, blocks: t.blocks.map(flip) })),
    currentTurn: agent.currentTurn === null ? null : { ...agent.currentTurn, blocks: agent.currentTurn.blocks.map(flip) },
  });
  return { ...state, agents: newAgents };
};

export const reduceToolToggle = (state: TuiState): TuiState => {
  if (state.focusedAgentId === null) return state;
  const agent = state.agents.get(state.focusedAgentId);
  if (agent === undefined) return state;
  const all = [...agent.history.flatMap((t) => t.cards), ...(agent.currentTurn?.cards ?? [])];
  if (all.length === 0) return state;
  const allExpanded = all.every((c) => c.expanded);
  const target = !allExpanded;
  const flip = (c: Card): Card => ({ ...c, expanded: target });
  const newAgents = new Map(state.agents);
  newAgents.set(state.focusedAgentId, {
    ...agent,
    history: agent.history.map((t) => ({ ...t, cards: t.cards.map(flip) })),
    currentTurn: agent.currentTurn === null ? null : { ...agent.currentTurn, cards: agent.currentTurn.cards.map(flip) },
  });
  return { ...state, agents: newAgents };
};

export const reduceClear = (state: TuiState): TuiState => ({
  ...state,
  agents: new Map(),
  leaderAgentId: null,
  focusedAgentId: null,
  queue: [],
  transientMessage: null,
  errorBanner: null,
});

export const reduceUiTransient = (state: TuiState, env: EventEnvelope): TuiState => {
  const payload = env.payload as unknown as TransientWirePayload | null;
  if (payload === null) return state;
  return { ...state, transientMessage: { text: payload.text, shownAt: payload.shownAt } };
};

export const reduceUiTransientClear = (state: TuiState): TuiState => ({ ...state, transientMessage: null });

export const reduceUiError = (state: TuiState, env: EventEnvelope): TuiState => {
  const payload = env.payload as unknown as TransientWirePayload | null;
  if (payload === null) return state;
  return { ...state, errorBanner: { text: payload.text, raisedAt: payload.shownAt } };
};

export const reduceUiErrorClear = (state: TuiState): TuiState => ({ ...state, errorBanner: null });