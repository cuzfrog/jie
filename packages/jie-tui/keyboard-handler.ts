import { Events, type EventManager } from "@cuzfrog/jie-platform/event";
import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { Actions, type Action, type TuiState } from "./state";

interface Keybinding {
  readonly combo: KeyId;
  readonly build: () => Action;
}

const DEFAULT_KEYBINDINGS: ReadonlyArray<Keybinding> = [
  { combo: "ctrl+left", build: () => Actions.toggleTeamRail() },
  { combo: "ctrl+up", build: () => Actions.switchCycleAgent(-1) },
  { combo: "ctrl+down", build: () => Actions.switchCycleAgent(1) },
];

export interface KeyboardHandlerDeps {
  readonly eventManager: EventManager;
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly confirmQuit: () => void;
  readonly cancelQuit: () => void;
  readonly requestQuit: () => void;
  readonly render: () => void;
}

export interface KeyboardHandler {
  handle: (data: string) => { consume: boolean } | undefined;
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
    const state = deps.getState();

    if (state.pendingQuit) {
      if (data === "y" || data === "Y") {
        deps.confirmQuit();
        return { consume: true };
      }
      if (data === "n" || data === "N" || data === "\r" || data === "\n") {
        deps.cancelQuit();
        return { consume: true };
      }
    }

    if (matchesKey(data, "escape")) {
      const at = now();
      if (at - lastEscapeAt <= escWindowMs && state.teamId !== null) {
        deps.eventManager.publish(Events.interruptTeam({ kind: "system" }, state.teamId));
        lastEscapeAt = 0;
        return { consume: true };
      }
      lastEscapeAt = at;
      return { consume: false };
    }

    if (matchesKey(data, "ctrl+d")) {
      const at = now();
      if (at - lastCtrlDAt <= ctrlDWindowMs) {
        deps.requestQuit();
        lastCtrlDAt = 0;
        return { consume: true };
      }
      lastCtrlDAt = at;
      return { consume: true };
    }

    if (matchesKey(data, "ctrl+c")) {
      deps.render();
      return { consume: true };
    }

    const action = handleKeyInput(data, bindings);
    if (action === undefined) return undefined;
    deps.dispatch(action);
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
