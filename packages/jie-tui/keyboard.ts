import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { Actions, type Action } from "./state";

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
