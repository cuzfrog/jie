import { Events } from "../../platform";
import { Actions, ActionTypes } from "./";
import { StateStoreImpl } from "./state-store";

describe("StateStore", () => {
  test("nested dispatch in subscriber preserves inner update", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "my-team",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null, sessionUsage: null }],
    })));
    store.subscribe((action) => {
      if (action.type === ActionTypes.SUBMIT_EDITOR_TEXT) {
        store.dispatch(
          Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "hello")),
        );
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    const before = store.getState();
    const agentBefore = before.agents.get("my-team:general-1");
    expect(agentBefore?.currentTurn).toBeNull();

    store.dispatch(Actions.submitEditorText("hello"));

    const after = store.getState();
    const agentAfter = after.agents.get("my-team:general-1");
    expect(agentAfter?.currentTurn).not.toBeNull();
    expect(agentAfter?.currentTurn?.userPrompt).toBe("hello");
  });

  test("nested dispatch in subscriber does not overwrite outer state", () => {
    const store = new StateStoreImpl();
    store.subscribe((action) => {
      if (action.type === ActionTypes.SUBMIT_EDITOR_TEXT) {
        store.dispatch(Actions.setEditorText("inner"));
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    store.dispatch(Actions.submitEditorText("outer"));
    expect(store.getState().editorText).toBe("inner");
  });

  test("multiple subscribers all receive the action", () => {
    const store = new StateStoreImpl();
    const calls: string[] = [];
    store.subscribe((action) => {
      calls.push(`a:${action.type}`);
      return Promise.resolve();
    });
    store.subscribe((action) => {
      calls.push(`b:${action.type}`);
      return Promise.resolve();
    });
    store.dispatch(Actions.setEditorText("x"));
    expect(calls).toContain(`a:${ActionTypes.SET_EDITOR_TEXT}`);
    expect(calls).toContain(`b:${ActionTypes.SET_EDITOR_TEXT}`);
  });

  test("unsubscribe stops further notifications", () => {
    const store = new StateStoreImpl();
    let count = 0;
    const off = store.subscribe(() => {
      count += 1;
      return Promise.resolve();
    });
    store.dispatch(Actions.setEditorText("a"));
    expect(count).toBe(1);
    off();
    store.dispatch(Actions.setEditorText("b"));
    expect(count).toBe(1);
  });

  test("state is updated before subscribers are invoked", () => {
    const store = new StateStoreImpl();
    let observed: string | undefined;
    store.subscribe((action) => {
      if (action.type === ActionTypes.SET_EDITOR_TEXT) {
        observed = store.getState().editorText;
      }
      return Promise.resolve();
    });
    store.dispatch(Actions.setEditorText("hello"));
    const observedAfter: string | undefined = observed;
    expect(observedAfter).toBe("hello");
  });

  test("subscriber rejection is logged but does not propagate from dispatch", async () => {
    const store = new StateStoreImpl();
    store.subscribe(() => Promise.reject(new Error("boom")));
    store.dispatch(Actions.setEditorText("hello"));
    expect(store.getState().editorText).toBe("hello");
    await new Promise((r) => setTimeout(r, 30));
  });
});
