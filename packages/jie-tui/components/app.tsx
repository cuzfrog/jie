import { useEffect, type JSX } from "react";
import { Box, useApp as useInkApp, useWindowSize } from "@cuzfrog/jie-ink";
import { TuiContext, type TuiContextValue } from "./context";
import { Layout } from "./layout";
import { GlobalKeyBindings } from "./global-keys";
import type { StateStore } from "../state";
import { useStateStore } from "../hooks";

interface AppProps {
  readonly stateStore: StateStore;
}

/**
 * Top-level TUI component. Subscribes to terminal resize via `useWindowSize`
 * so the chat pane, rail, and layout rebuild on SIGWINCH. Without this hook
 * the layout reads `useStdout().columns` once and never re-renders when the
 * user resizes the terminal.
 */
export function App({ stateStore }: AppProps): JSX.Element {
  const { columns, rows } = useWindowSize();
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
