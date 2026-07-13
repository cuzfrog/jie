import { Events } from "@cuzfrog/jie-platform";
import { render } from "../../test-renderer";
import { ChatPane } from "./chat-pane";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("ChatPane scroll confinement", () => {
  test("scrolled to top: latest prompt (prompt-29) is NOT visible", () => {
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
      stateStore.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
    }
    stateStore.dispatch(Actions.jumpChat("demo:general-1", "top"));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const VIEWPORT_HEIGHT = 8;
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <ChatPane width={80} height={VIEWPORT_HEIGHT} />
      </TuiContext.Provider>,
    );
    const frame = (lastFrame() ?? "").replace(/\[\d+m/g, "");
    const lines = frame.split("\n");
    console.log("VIEWPORT_HEIGHT", VIEWPORT_HEIGHT, "actual lines", lines.length);
    for (let i = 0; i < lines.length; i++) {
      console.log(`[${i}] ${JSON.stringify(lines[i])}`);
    }
    const prompt0 = lines.findIndex((l) => l.includes("prompt-0"));
    const prompt29 = lines.findIndex((l) => l.includes("prompt-29"));
    expect(prompt0).toBeGreaterThanOrEqual(0);
    expect(prompt29).toBe(-1);
    unmount();
  });
});