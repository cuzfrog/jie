import { TuiState, createStateStore, type StateStore } from "./state";
import { type TuiContextValue } from "./components";

interface ContextOverrides {
  readonly stateStore?: StateStore;
  readonly state?: TuiContextValue["state"];
  readonly focusedAgent?: TuiContextValue["focusedAgent"];
  readonly thinkingExpanded?: boolean;
  readonly toolCardsExpanded?: boolean;
  readonly dispatch?: TuiContextValue["dispatch"];
  readonly setThinkingExpanded?: TuiContextValue["setThinkingExpanded"];
  readonly setToolCardsExpanded?: TuiContextValue["setToolCardsExpanded"];
}

export function makeContextValue(overrides: ContextOverrides = {}): TuiContextValue {
  const stateStore = overrides.stateStore ?? createStateStore();
  const state = overrides.state ?? stateStore.getState();
  const focusedAgent = overrides.focusedAgent ?? TuiState.getFocusedAgent(state);
  return {
    state,
    dispatch: overrides.dispatch ?? ((action) => stateStore.dispatch(action)),
    focusedAgent,
    thinkingExpanded: overrides.thinkingExpanded ?? false,
    toolCardsExpanded: overrides.toolCardsExpanded ?? false,
    setThinkingExpanded: overrides.setThinkingExpanded ?? ((): void => undefined),
    setToolCardsExpanded: overrides.setToolCardsExpanded ?? ((): void => undefined),
  };
}
