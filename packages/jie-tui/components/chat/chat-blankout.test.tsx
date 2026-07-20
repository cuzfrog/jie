import { Events } from "@cuzfrog/jie-platform";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { render } from "../../test-renderer";
import { makeContextValue } from "../../test-support";
import { ChatPane } from "./chat-pane";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

describe("ChatPane with content taller than its measurement used to paint", () => {
  test("a turn whose source lines merge into few painted rows still shows its tail", () => {
    const text = Array.from({ length: 30 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`).join("\n");
    const frame = renderPaneWithReply(text, 100, 25);
    expect(frame).toContain("c01");
    expect(frame).toContain("c30");
  });

  test("tall content tail-pins to the last paragraph without blanking the history", () => {
    const text = Array.from({ length: 40 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`).join("\n\n");
    const frame = renderPaneWithReply(text, 100, 25);
    expect(frame).toContain("p40");
    expect(frame).not.toContain("p01");
  });
});

function renderPaneWithReply(replyText: string, width: number, height: number): string {
  const stateStore = createStateStore();
  stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "demo", leaderKey: "general-1",
    agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", "hi", "general-1")));
  stateStore.dispatch(Actions.receiveEvent(Events.agentStreamChunk(
    { kind: "agent", teamId: "demo", agentKey: "general-1" }, 1, 1, "text", replyText,
  )));
  const state = stateStore.getState();
  const ctx = makeContextValue({ stateStore, state });
  const { lastFrame, unmount } = render(
    <TuiContext.Provider value={ctx}>
      <ChatPane width={width} height={height} />
    </TuiContext.Provider>,
  );
  const frame = (lastFrame() ?? "").replace(ANSI, "");
  unmount();
  return frame;
}
