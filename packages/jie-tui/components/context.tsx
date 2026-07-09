import { createContext, useContext } from "react";
import type { TuiState, AgentUiState, Action } from "../state";

export interface TuiContextValue {
  readonly state: TuiState;
  readonly dispatch: (action: Action) => void;
}

export const TuiContext = createContext<TuiContextValue | null>(null);

export function useTuiContext(): TuiContextValue {
  const ctx = useContext(TuiContext);
  if (ctx === null) throw new Error("TuiContext is not provided; wrap your tree in <TuiContext.Provider>");
  return ctx;
}

export function useFocusedAgent(): AgentUiState | null {
  const { state } = useTuiContext();
  if (state.focusedAgentId === null) return null;
  return state.agents.get(state.focusedAgentId) ?? null;
}