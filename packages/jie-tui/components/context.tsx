import { createContext, useContext } from "react";
import type { TuiState, AgentUiState, Action } from "../state";

export interface TuiContextValue {
  readonly state: TuiState;
  readonly dispatch: (action: Action) => void;
  readonly focusedAgent: AgentUiState | null;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
  readonly setThinkingExpanded: (next: boolean) => void;
  readonly setToolCardsExpanded: (next: boolean) => void;
}

export const TuiContext = createContext<TuiContextValue | null>(null);

export function useTuiContext(): TuiContextValue {
  const ctx = useContext(TuiContext);
  if (ctx === null) throw new Error("TuiContext is not provided; wrap your tree in <TuiContext.Provider>");
  return ctx;
}

export function useFocusedAgent(): AgentUiState | null {
  return useTuiContext().focusedAgent;
}