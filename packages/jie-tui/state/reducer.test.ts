import { Actions } from "./actions";
import { Events } from "@cuzfrog/jie-platform";
import { createStateStore } from "./state-store";
import { reduce } from "./reducer";

describe("reduce — dispatch router", () => {
  test("returns state unchanged for an unknown bus topic", () => {
    const state = createStateStore().getState();
    const same = reduce(state, Actions.receiveEvent(Events.agentInterrupt({ kind: "user" }, "t1", "general-1")));
    expect(same).toBe(state);
  });
});
