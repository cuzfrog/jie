import { useEffect, useRef } from "react";
import { useInput } from "ink";
import { Actions, type StateStore, type TuiState } from "../../state";
import type { JiePlatform } from "@cuzfrog/jie-platform";

export interface GlobalKeyBindingsProps {
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
  readonly onToggleThinking: () => void;
  readonly onToggleToolCards: () => void;
  readonly now?: () => number;
}

const ESC_WINDOW_MS = 300;
const CTRL_D_WINDOW_MS = 500;

export function GlobalKeyBindings({
  stateStore,
  platform,
  onToggleThinking,
  onToggleToolCards,
  now = Date.now,
}: GlobalKeyBindingsProps): null {
  const lastEscapeAt = useRef<number>(0);
  const lastCtrlDAt = useRef<number>(0);

  useEffect(() => {
    return (): void => {
      lastEscapeAt.current = 0;
      lastCtrlDAt.current = 0;
    };
  }, []);

  useInput((input, key) => {
    const state = stateStore.getState();

    if (key.escape) {
      const at = now();
      const consumed = tryDoubleEscInterrupt(state, platform, lastEscapeAt.current, at);
      lastEscapeAt.current = consumed ? 0 : at;
      return;
    }

    if (key.ctrl && input === "d") {
      const at = now();
      const consumed = tryDoubleCtrlDQuit(stateStore, lastCtrlDAt.current, at);
      lastCtrlDAt.current = consumed ? 0 : at;
      return;
    }

    if (key.ctrl && input === "c") {
      handleCtrlC(state, stateStore);
      return;
    }

    if (key.ctrl && input === "t") {
      onToggleThinking();
      return;
    }

    if (key.ctrl && input === "o") {
      onToggleToolCards();
      return;
    }

    if (key.shift && key.leftArrow) {
      stateStore.dispatch(Actions.toggleTeamRail());
      return;
    }

    if (key.ctrl && key.upArrow) {
      stateStore.dispatch(Actions.switchCycleAgent(-1));
      return;
    }

    if (key.ctrl && key.downArrow) {
      stateStore.dispatch(Actions.switchCycleAgent(1));
      return;
    }

    if (key.shift && key.upArrow) {
      stateStore.dispatch(Actions.switchCycleAgent(-1));
      return;
    }

    if (key.shift && key.downArrow) {
      stateStore.dispatch(Actions.switchCycleAgent(1));
      return;
    }
  });

  return null;
}

function tryDoubleEscInterrupt(
  state: TuiState,
  platform: JiePlatform,
  lastEscapeAt: number,
  at: number,
): boolean {
  if (at - lastEscapeAt > ESC_WINDOW_MS) return false;
  if (state.teamId === null || state.focusedAgentId === null) return false;
  const focused = state.agents.get(state.focusedAgentId);
  if (focused === undefined) return false;
  platform.interrupt(focused.teamId, focused.agentKey);
  return true;
}

function tryDoubleCtrlDQuit(stateStore: StateStore, lastCtrlDAt: number, at: number): boolean {
  if (at - lastCtrlDAt <= CTRL_D_WINDOW_MS) {
    stateStore.dispatch(Actions.requestQuit());
    return true;
  }
  return false;
}

function handleCtrlC(state: TuiState, stateStore: StateStore): void {
  if (state.editorText !== "") {
    stateStore.dispatch(Actions.setEditorText(""));
    return;
  }
  stateStore.dispatch(Actions.requestQuit());
}