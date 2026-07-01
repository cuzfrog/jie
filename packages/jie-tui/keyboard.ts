import { Events, type EventManager } from "@cuzfrog/jie-platform/event";
import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { Actions, type Action, type TuiState } from "./state";

export interface Keybinding {
  readonly combo: KeyId;
  readonly build: () => Action;
}

export interface KeyHandlerResult {
  readonly action: Action;
  readonly consume: true;
}

export const DEFAULT_KEYBINDINGS: ReadonlyArray<Keybinding> = [
  { combo: "ctrl+left", build: () => Actions.toggleTeamRail() },
  { combo: "ctrl+up", build: () => Actions.switchCycleAgent(-1) },
  { combo: "ctrl+down", build: () => Actions.switchCycleAgent(1) },
];

export function handleKeyInput(
  data: string,
  bindings: ReadonlyArray<Keybinding> = DEFAULT_KEYBINDINGS,
): KeyHandlerResult | undefined {
  for (const binding of bindings) {
    if (matchesKey(data, binding.combo)) {
      return { action: binding.build(), consume: true };
    }
  }
  return undefined;
}

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
  readonly bindings?: ReadonlyArray<Keybinding>;
  readonly now?: () => number;
}

const DEFAULT_ESC_WINDOW_MS = 300;
const DEFAULT_CTRL_D_WINDOW_MS = 500;

export function createKeyboardHandler(deps: KeyboardHandlerDeps, opts: KeyboardHandlerOptions = {}): KeyboardHandler {
  const bindings = opts.bindings ?? DEFAULT_KEYBINDINGS;
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
        deps.render();
        return { consume: true };
      }
      if (data === "n" || data === "N" || data === "\r" || data === "\n") {
        deps.cancelQuit();
        deps.render();
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
        deps.render();
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

    const hit = handleKeyInput(data, bindings);
    if (hit === undefined) return undefined;
    deps.dispatch(hit.action);
    return { consume: true };
  };

  return { handle };
}