import { Actions } from "./actions";
import { createStateStore } from "./state-store";
import { reduce } from "./reducer";

describe("reduce — dispatch router", () => {
  test("returns state unchanged for an unknown bus topic", () => {
    const state = createStateStore().getState();
    const same = reduce(state, Actions.receiveEvent({
      version: 1,
      type: "system.interrupted",
      topic: "system.interrupted",
      sender: { kind: "system" },
      timestamp: "2026-06-27T12:00:00.000Z",
      payload: null,
    }));
    expect(same).toBe(state);
  });
});
