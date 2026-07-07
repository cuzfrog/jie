import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { Actions, type Action, type StateStore, type TuiState } from "./state";

interface Interrupter {
  readonly interrupt: (teamId: string, agentKey: string) => void;
}

interface Keybinding {
  readonly combo: KeyId;
  readonly build: () => Action;
}

const DEFAULT_KEYBINDINGS: ReadonlyArray<Keybinding> = [
  { combo: "shift+left", build: () => Actions.toggleTeamRail() },
  { combo: "ctrl+up", build: () => Actions.switchCycleAgent(-1) },
  { combo: "ctrl+down", build: () => Actions.switchCycleAgent(1) },
  { combo: "shift+up", build: () => Actions.switchCycleAgent(-1) },
  { combo: "shift+down", build: () => Actions.switchCycleAgent(1) },
];

export interface KeyboardHandlerDeps {
  readonly platform: Interrupter;
  readonly stateStore: StateStore;
}

export interface KeyboardHandler {
  handle(data: string): { readonly consume: boolean } | undefined;
}

export interface KeyboardHandlerOptions {
  readonly now?: () => number;
}

const DEFAULT_ESC_WINDOW_MS = 300;
const DEFAULT_CTRL_D_WINDOW_MS = 500;

export function createKeyboardHandler(deps: KeyboardHandlerDeps, opts: KeyboardHandlerOptions = {}): KeyboardHandler {
  const bindings = DEFAULT_KEYBINDINGS;
  const now = opts.now ?? Date.now;
  const escWindowMs = DEFAULT_ESC_WINDOW_MS;
  const ctrlDWindowMs = DEFAULT_CTRL_D_WINDOW_MS;

  let lastEscapeAt = 0;
  let lastCtrlDAt = 0;

  const handle = (data: string): { consume: boolean } | undefined => {
    const state = deps.stateStore.getState();

    if (matchesKey(data, "escape")) {
      const at = now();
      const consumed = tryDoubleEscInterrupt(deps, state, lastEscapeAt, at, escWindowMs);
      lastEscapeAt = consumed.newLastEscapeAt ?? at;
      return { consume: consumed.consume };
    }

    if (matchesKey(data, "ctrl+d")) {
      const at = now();
      const consumed = tryDoubleCtrlDQuit(deps, lastCtrlDAt, at, ctrlDWindowMs);
      lastCtrlDAt = consumed.newLastCtrlDAt ?? at;
      return { consume: consumed.consume };
    }

    if (matchesKey(data, "ctrl+c")) {
      const editorText = state.editorText;
      if (editorText !== "") {
        deps.stateStore.dispatch(Actions.setEditorText(""));
        return { consume: true };
      }
      deps.stateStore.dispatch(Actions.requestQuit());
      return { consume: true };
    }

    const action = handleKeyInput(data, bindings);
    if (action === undefined) return undefined;
    deps.stateStore.dispatch(action);
    return { consume: true };
  };

  return { handle };
}

function handleKeyInput(data: string, keyBindings: ReadonlyArray<Keybinding>): Action | undefined {
  for (const binding of keyBindings) {
    if (matchesKey(data, binding.combo)) {
      return binding.build();
    }
  }
  return undefined;
}

type TryResult = { consume: boolean; newLastEscapeAt?: number; newLastCtrlDAt?: number };

function tryDoubleEscInterrupt(
  deps: KeyboardHandlerDeps,
  state: TuiState,
  lastEscapeAt: number,
  now: number,
  escWindowMs: number,
): TryResult {
  if (now - lastEscapeAt > escWindowMs || state.teamId === null || state.focusedAgentId === null) {
    return { consume: false, newLastEscapeAt: now };
  }
  const focused = state.agents.get(state.focusedAgentId);
  if (focused === undefined) return { consume: false, newLastEscapeAt: now };
  deps.platform.interrupt(focused.teamId, focused.agentKey);
  return { consume: true, newLastEscapeAt: 0 };
}

function tryDoubleCtrlDQuit(
  deps: KeyboardHandlerDeps,
  lastCtrlDAt: number,
  now: number,
  ctrlDWindowMs: number,
): TryResult {
  if (now - lastCtrlDAt <= ctrlDWindowMs) {
    deps.stateStore.dispatch(Actions.requestQuit());
    return { consume: true, newLastCtrlDAt: 0 };
  }
  return { consume: true, newLastCtrlDAt: now };
}