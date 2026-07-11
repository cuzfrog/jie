import { useEffect, useRef } from "react";
import { useInput } from "ink";
import { useTuiContext } from "./context";
import { Actions, type TuiState } from "../state";

interface GlobalKeyBindingsProps {
  readonly now?: () => number;
}

const CTRL_D_WINDOW_MS = 500;

export function GlobalKeyBindings({ now = Date.now }: GlobalKeyBindingsProps = {}): null {
  const { state, dispatch } = useTuiContext();
  const lastCtrlDAt = useRef<number>(0);

  useEffect(() => {
    return (): void => {
      lastCtrlDAt.current = 0;
    };
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      interruptFocusedBusyAgent(state, dispatch);
      return;
    }

    if (key.ctrl && input === "d") {
      const at = now();
      const consumed = tryDoubleCtrlDQuit(dispatch, lastCtrlDAt.current, at);
      lastCtrlDAt.current = consumed ? 0 : at;
      return;
    }

    if (key.ctrl && input === "c") {
      handleCtrlC(state, dispatch);
      return;
    }

    if (key.ctrl && input === "t") {
      dispatch(Actions.toggleThinking());
      return;
    }

    if (key.ctrl && input === "o") {
      dispatch(Actions.toggleToolCards());
      return;
    }

    if (key.shift && key.leftArrow) {
      dispatch(Actions.toggleTeamRail());
      return;
    }

    if (key.ctrl && key.upArrow) {
      dispatch(Actions.switchCycleAgent(-1));
      return;
    }

    if (key.ctrl && key.downArrow) {
      dispatch(Actions.switchCycleAgent(1));
      return;
    }

    if (key.shift && key.upArrow) {
      dispatch(Actions.switchCycleAgent(-1));
      return;
    }

    if (key.shift && key.downArrow) {
      dispatch(Actions.switchCycleAgent(1));
      return;
    }
  });

  return null;
}

function interruptFocusedBusyAgent(
  state: TuiState,
  dispatch: (action: ReturnType<typeof Actions.requestInterrupt>) => void,
): void {
  if (state.teamId === null || state.focusedAgentId === null) return;
  const focused = state.agents.get(state.focusedAgentId);
  if (focused === undefined || focused.status !== "busy") return;
  dispatch(Actions.requestInterrupt(focused.teamId, focused.agentKey));
}

function tryDoubleCtrlDQuit(dispatch: (action: ReturnType<typeof Actions.requestQuit>) => void, lastCtrlDAt: number, at: number): boolean {
  if (at - lastCtrlDAt <= CTRL_D_WINDOW_MS) {
    dispatch(Actions.requestQuit());
    return true;
  }
  return false;
}

function handleCtrlC(state: TuiState, dispatch: (action: ReturnType<typeof Actions.setEditorText | typeof Actions.requestQuit>) => void): void {
  if (state.editorText !== "") {
    dispatch(Actions.setEditorText(""));
    return;
  }
  dispatch(Actions.requestQuit());
}
