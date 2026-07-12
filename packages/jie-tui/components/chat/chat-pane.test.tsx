import { Events } from "@cuzfrog/jie-platform";
import { render } from "../../test-renderer";
import { ChatPane } from "./chat-pane";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("ChatPane", () => {
  test("renders 'no focused agent' when no agent is focused", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><ChatPane width={40} height={20} /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("no focused agent");
    unmount();
  });

  test("renders user prompt with prefix and assistant block text", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", "hello", "general-1")));
    stateStore.dispatch(Actions.receiveEvent(
      Events.agentStreamChunk({ kind: "agent", teamId: "demo", agentKey: "general-1" }, 1, 0, "text", "world"),
    ));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><ChatPane width={80} height={20} /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("hello");
    expect(frame).toContain("world");
    unmount();
  });
});
