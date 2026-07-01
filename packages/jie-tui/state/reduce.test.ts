import { Actions } from "./actions";
import { INITIAL_TUI_STATE } from "./state";
import { reduce } from "./reducer";

describe("reduce — dispatch router", () => {
  test("returns state unchanged for an unknown bus topic", () => {
    const state = INITIAL_TUI_STATE;
    const same = reduce(state, Actions.receiveEvent({
      version: 1,
      type: "system.team.interrupted",
      topic: "system.team.interrupted",
      sender: { kind: "system" },
      timestamp: "2026-06-27T12:00:00.000Z",
      payload: { teamId: "my-team" },
    }));
    expect(same).toBe(state);
  });
});
