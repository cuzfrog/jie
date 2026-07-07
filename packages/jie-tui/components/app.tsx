import { useEffect, useState, useSyncExternalStore } from "react";
import { Box, useApp as useInkApp, useStdout } from "ink";
import type { Tui } from "../tui";
import type { TuiState, AgentUiState, StateStore } from "../state";
import { Actions } from "../state";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import { TuiContext, type TuiContextValue } from "./context";
import { Layout } from "./layout/layout";
import { GlobalKeyBindings } from "./global-keys";

export interface AppProps {
  readonly tui: Tui;
  readonly platform: JiePlatform;
  readonly cwd: string;
  readonly gitBranch?: string;
  readonly gitDirty?: boolean;
}

export function App(props: AppProps): JSX.Element {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const inkApp = useInkApp();
  const stateStore: StateStore = (props.tui as unknown as { stateStore: StateStore }).stateStore;
  const state = useSyncExternalStore<TuiState>(
    (cb) => stateStore.subscribe(cb),
    () => stateStore.getState(),
    () => stateStore.getState(),
  );
  const [thinkingExpanded, setThinkingExpanded] = useState<boolean>(false);
  const [toolCardsExpanded, setToolCardsExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (state.pendingQuit) {
      inkApp.exit();
    }
  }, [state.pendingQuit, inkApp]);

  const focused: AgentUiState | null = state.focusedAgentId === null
    ? null
    : state.agents.get(state.focusedAgentId) ?? null;

  const ctx: TuiContextValue = {
    tui: props.tui,
    state,
    stateStore,
    platform: props.platform,
    focusedAgent: focused,
    thinkingExpanded,
    toolCardsExpanded,
    setThinkingExpanded,
    setToolCardsExpanded,
  };

  return (
    <TuiContext.Provider value={ctx}>
      <GlobalKeyBindings
        stateStore={stateStore}
        platform={props.platform}
        onToggleThinking={() => setThinkingExpanded((v) => !v)}
        onToggleToolCards={() => setToolCardsExpanded((v) => !v)}
      />
      <Box flexDirection="column" width={columns} height={rows}>
        <Layout
          columns={columns}
          rows={rows}
          cwd={props.cwd}
          gitBranch={props.gitBranch ?? ""}
          gitDirty={props.gitDirty ?? false}
          stateStore={stateStore}
          onSubmit={(text) => {
            stateStore.dispatch(Actions.clearBanners());
            props.tui.submit(text);
          }}
        />
      </Box>
    </TuiContext.Provider>
  );
}