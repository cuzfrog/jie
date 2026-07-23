import { Actions } from "./actions";
import { Events } from "@cuzfrog/jie-platform";
import { StateStoreImpl } from "./state-store";
import { reduce } from "./reducer";

describe("reduce — dispatch router", () => {
  test("returns state unchanged for an unknown bus topic", () => {
    const state = new StateStoreImpl().getState();
    const same = reduce(state, Actions.receiveEvent(Events.agentInterrupt({ kind: "user" }, "t1", "general-1")));
    expect(same).toBe(state);
  });
});
