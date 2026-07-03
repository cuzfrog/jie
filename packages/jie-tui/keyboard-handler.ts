import { Events, type EventEnvelope, type EventType } from "@cuzfrog/jie-platform/event";
import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { Actions, type Action, type StateStore, type TuiState } from "./state";

interface EventPublisher {
  publish<T extends EventType>(event: EventEnvelope<T>): void;
}

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
  readonly eventManager: EventPublisher;
  readonly stateStore: StateStore;
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
    const state = deps.stateStore.getState();

    if (state.pendingQuit) {
      const consumed = tryResolvePendingQuit(data, deps);
      if (consumed !== null) return consumed;
    }

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
      deps.render();
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

function tryResolvePendingQuit(data: string, deps: KeyboardHandlerDeps): { consume: true } | null {
  if (data === "y" || data === "Y") {
    deps.confirmQuit();
    return { consume: true };
  }
  if (data === "n" || data === "N" || data === "\r" || data === "\n") {
    deps.cancelQuit();
    return { consume: true };
  }
  return null;
}

function tryDoubleEscInterrupt(
  deps: KeyboardHandlerDeps,
  state: TuiState,
  lastEscapeAt: number,
  now: number,
  escWindowMs: number,
): TryResult {
  if (now - lastEscapeAt <= escWindowMs && state.teamId !== null) {
    deps.eventManager.publish(Events.interrupt({ kind: "system" }));
    return { consume: true, newLastEscapeAt: 0 };
  }
  return { consume: false, newLastEscapeAt: now };
}

function tryDoubleCtrlDQuit(
  deps: KeyboardHandlerDeps,
  lastCtrlDAt: number,
  now: number,
  ctrlDWindowMs: number,
): TryResult {
  if (now - lastCtrlDAt <= ctrlDWindowMs) {
    deps.requestQuit();
    return { consume: true, newLastCtrlDAt: 0 };
  }
  return { consume: true, newLastCtrlDAt: now };
}
