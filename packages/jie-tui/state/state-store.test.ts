import { Events } from "@cuzfrog/jie-platform";
import { Actions, createStateStore } from "./";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("StateStore", () => {
  test("nested dispatch in subscriber preserves inner update", () => {
    const store = createStateStore();
    store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "my-team",
      leaderKey: "general-1",
      agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    store.subscribe((action) => {
      if (action.type === Actions.submitEditorText("").type) {
        store.dispatch(
          Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "hello", "general-1")),
        );
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    const before = store.getState();
    const agentBefore = before.agents.get("my-team:general-1" as never);
    expect(agentBefore?.currentTurn).toBeNull();

    store.dispatch(Actions.submitEditorText("hello"));

    const after = store.getState();
    const agentAfter = after.agents.get("my-team:general-1" as never);
    expect(agentAfter?.currentTurn).not.toBeNull();
    expect(agentAfter?.currentTurn?.userPrompt).toBe("hello");
  });

  test("nested dispatch in subscriber does not overwrite outer state", () => {
    const store = createStateStore();
    store.subscribe((action) => {
      if (action.type === Actions.submitEditorText("").type) {
        store.dispatch(Actions.setEditorText("inner"));
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    store.dispatch(Actions.submitEditorText("outer"));
    expect(store.getState().editorText).toBe("inner");
  });

  test("multiple subscribers all receive the action", () => {
    const store = createStateStore();
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
    expect(calls).toContain(`a:${Actions.setEditorText("").type}`);
    expect(calls).toContain(`b:${Actions.setEditorText("").type}`);
  });

  test("unsubscribe stops further notifications", () => {
    const store = createStateStore();
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
    const store = createStateStore();
    let observed: string | undefined;
    store.subscribe((action) => {
      if (action.type === Actions.setEditorText("").type) {
        observed = store.getState().editorText;
      }
      return Promise.resolve();
    });
    store.dispatch(Actions.setEditorText("hello"));
    const observedAfter: string | undefined = observed;
    expect(observedAfter).toBe("hello");
  });

  test("subscriber rejection is logged but does not propagate from dispatch", async () => {
    const store = createStateStore();
    store.subscribe(() => Promise.reject(new Error("boom")));
    store.dispatch(Actions.setEditorText("hello"));
    expect(store.getState().editorText).toBe("hello");
    await new Promise((r) => setTimeout(r, 30));
  });
});