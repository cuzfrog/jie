import { useEffect, type JSX } from "react";
import { Box, useApp as useInkApp, useWindowSize } from "@cuzfrog/jie-ink";
import { TuiContext, type TuiContextValue } from "./context";
import { Layout } from "./layout";
import { GlobalKeyBindings } from "./global-keys";
import { SessionPicker } from "./session-list/session-picker";
import { Actions } from "../state";
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
        {state.sessionPickerOpen ? (
          <Box position="absolute">
            <SessionPicker
              sessions={state.sessionPickerSessions}
              query={state.sessionPickerQuery}
              focusedIndex={state.sessionPickerFocus}
              width={Math.min(columns, 80)}
              height={Math.min(rows - 2, 20)}
              onQueryChange={(q): void => {
                dispatch(Actions.setPickerQuery(q));
              }}
              onFocusChange={(delta): void => {
                dispatch(Actions.focusPickerIndex(delta));
              }}
              onSelect={(session): void => {
                const teamId = state.teamId;
                if (teamId !== null) {
                  dispatch(Actions.selectPickedSession(teamId, session.sessionId));
                }
                dispatch(Actions.closeSessionPicker());
              }}
              onClose={(): void => {
                dispatch(Actions.closeSessionPicker());
              }}
            />
          </Box>
        ) : null}
      </Box>
    </TuiContext.Provider>
  );
}
