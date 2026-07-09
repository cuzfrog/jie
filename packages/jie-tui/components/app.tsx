import { useEffect, useState } from "react";
import { Box, useApp as useInkApp, useStdout } from "ink";
import { TuiContext, type TuiContextValue } from "./context";
import { Layout } from "./layout";
import { GlobalKeyBindings } from "./global-keys";
import { type TuiState, type AgentUiState, type Action } from "../state";

export interface AppProps {
  readonly state: TuiState;
  readonly dispatch: (action: Action) => void;
}

export function App({ state, dispatch }: AppProps): JSX.Element {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const inkApp = useInkApp();
  const [thinkingExpanded, setThinkingExpanded] = useState<boolean>(false);
  const [toolCardsExpanded, setToolCardsExpanded] = useState<boolean>(false);
  useEffect(() => {
    if (state.pendingQuit) inkApp.exit();
  }, [state.pendingQuit, inkApp]);
  const focused: AgentUiState | null = state.focusedAgentId === null
    ? null
    : state.agents.get(state.focusedAgentId) ?? null;
  const ctx: TuiContextValue = {
    state,
    dispatch,
    focusedAgent: focused,
    thinkingExpanded,
    toolCardsExpanded,
    setThinkingExpanded,
    setToolCardsExpanded,
  };
  return (
    <TuiContext.Provider value={ctx}>
      <GlobalKeyBindings
        onToggleThinking={() => setThinkingExpanded((v) => !v)}
        onToggleToolCards={() => setToolCardsExpanded((v) => !v)}
      />
      <Box flexDirection="column" width={columns} height={rows}>
        <Layout columns={columns} rows={rows} />
      </Box>
    </TuiContext.Provider>
  );
}