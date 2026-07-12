import { Events } from "@cuzfrog/jie-platform";
import { render } from "../../test-renderer";
import { ChatPane } from "./chat-pane";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("ChatPane scroll (reproduction)", () => {
  test("long conversation: latest user prompt is visible at the bottom of the chat viewport", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
    for (let i = 0; i < 30; i++) {
      stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", `prompt-${i}`, "general-1")));
      stateStore.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender)));
      stateStore.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, i + 1, 0, "text", `reply-${i}`)));
      if (i < 29) {
        stateStore.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
      }
    }
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const VIEWPORT_HEIGHT = 12;
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <ChatPane width={80} height={VIEWPORT_HEIGHT} />
      </TuiContext.Provider>,
    );
    const frame = (lastFrame() ?? "").replace(/\u001b\[\d+m/g, "");
    const lines = frame.split("\n");
    // Bug: chat does not scroll, so the latest user prompt `prompt-29` is invisible
    // and only the middle of the conversation is visible.
    expect(lines).toContain("› prompt-29");
    unmount();
  });
});
