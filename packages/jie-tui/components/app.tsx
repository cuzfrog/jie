import { useEffect } from "react";
import { Box, useApp as useInkApp, useStdout } from "ink";
import { TuiContext, type TuiContextValue } from "./context";
import { Layout } from "./layout";
import { GlobalKeyBindings } from "./global-keys";
import type { StateStore } from "../state";
import { useStateStore } from "../hooks";

interface AppProps {
  readonly stateStore: StateStore;
}

export function App({ stateStore }: AppProps): JSX.Element {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const inkApp = useInkApp();
  const { state, dispatch } = useStateStore(stateStore);
  useEffect(() => {
    if (state.pendingQuit) inkApp.exit();
  }, [state.pendingQuit, inkApp]);
  const ctx: TuiContextValue = { state, dispatch };
  return (
    <TuiContext.Provider value={ctx}>
      <GlobalKeyBindings />
      <Box flexDirection="column" width={columns} height={rows}>
        <Layout columns={columns} rows={rows} />
      </Box>
    </TuiContext.Provider>
  );
}