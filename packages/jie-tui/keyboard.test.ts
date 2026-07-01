import { handleKeyInput, DEFAULT_KEYBINDINGS } from "./keyboard";
import { Actions, ActionTypes } from "./state";

describe("handleKeyInput", () => {
  test("ctrl+left dispatches toggleTeamRail", () => {
    const hit = handleKeyInput("\x1b[1;5D", DEFAULT_KEYBINDINGS);
    expect(hit).toBeDefined();
    expect(hit!.consume).toBe(true);
    expect(hit!.action).toEqual(Actions.toggleTeamRail());
  });

  test("ctrl+up dispatches switchCycleAgent(-1)", () => {
    const hit = handleKeyInput("\x1b[1;5A", DEFAULT_KEYBINDINGS);
    expect(hit).toBeDefined();
    expect(hit!.consume).toBe(true);
    expect(hit!.action).toEqual(Actions.switchCycleAgent(-1));
  });

  test("ctrl+down dispatches switchCycleAgent(+1)", () => {
    const hit = handleKeyInput("\x1b[1;5B", DEFAULT_KEYBINDINGS);
    expect(hit).toBeDefined();
    expect(hit!.consume).toBe(true);
    expect(hit!.action).toEqual(Actions.switchCycleAgent(1));
  });

  test("unmatched key returns undefined", () => {
    const hit = handleKeyInput("plain text", DEFAULT_KEYBINDINGS);
    expect(hit).toBeUndefined();
  });

  test("empty input returns undefined", () => {
    const hit = handleKeyInput("", DEFAULT_KEYBINDINGS);
    expect(hit).toBeUndefined();
  });

  test("custom bindings override the defaults", () => {
    const hit = handleKeyInput("\x1b[1;5D", [
      { combo: "ctrl+left", build: () => Actions.clearTuiState() },
    ]);
    expect(hit).toBeDefined();
    expect(hit!.action.type).toBe(ActionTypes.CLEAR_TUI_STATE);
  });

  test("first match wins", () => {
    const hit = handleKeyInput("\x1b[1;5D", [
      { combo: "ctrl+left", build: () => Actions.toggleTeamRail() },
      { combo: "ctrl+left", build: () => Actions.switchCycleAgent(1) },
    ]);
    expect(hit!.action.type).toBe(ActionTypes.TOGGLE_TEAM_RAIL);
  });
});
