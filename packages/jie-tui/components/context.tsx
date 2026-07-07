import { createContext, useContext } from "react";
import type { TuiState, AgentUiState, StateStore } from "../state";
import type { Tui } from "../tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";

export interface TuiContextValue {
  readonly tui: Tui;
  readonly state: TuiState;
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
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