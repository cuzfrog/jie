import { render } from "../../test-renderer";
import { ChatVisibleTurn } from "./chat-visible-turn";
import type { MessageTurn } from "../../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function messageTurn(prompt: string, reply: string): MessageTurn {
  return { userPrompt: prompt, cards: [], blocks: [{ kind: "text", text: reply }], streamId: null };
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

function linesOf(frame: string): ReadonlyArray<string> {
  return frame.replace(ANSI, "").split("\n");
}

describe("ChatVisibleTurn", () => {
  test("turn 0 renders content without a leading separator", () => {
    const { lastFrame, unmount } = render(
      <ChatVisibleTurn
        turn={messageTurn("p0", "r0")}
        turnIndex={0}
        isFirstVisible={true}
        hiddenRows={0}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    const lines = linesOf(lastFrame() ?? "");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("p0");
    unmount();
  });

  test("a non-first visible turn leads with a blank separator row", () => {
    const { lastFrame, unmount } = render(
      <ChatVisibleTurn
        turn={messageTurn("p1", "r1")}
        turnIndex={1}
        isFirstVisible={false}
        hiddenRows={0}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    const lines = linesOf(lastFrame() ?? "");
    expect(lines).toHaveLength(3);
    expect(lines[0]?.trim()).toBe("");
    expect(lines[1]).toContain("p1");
    unmount();
  });

  test("the first visible turn keeps its separator when the window starts on the separator row", () => {
    const { lastFrame, unmount } = render(
      <ChatVisibleTurn
        turn={messageTurn("p1", "r1")}
        turnIndex={1}
        isFirstVisible={true}
        hiddenRows={0}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    const lines = linesOf(lastFrame() ?? "");
    expect(lines).toHaveLength(3);
    expect(lines[0]?.trim()).toBe("");
    expect(lines[1]).toContain("p1");
    unmount();
  });

  test("hiddenRows=1 hides exactly the separator and shows the content flush", () => {
    const { lastFrame, unmount } = render(
      <ChatVisibleTurn
        turn={messageTurn("p1", "r1")}
        turnIndex={1}
        isFirstVisible={true}
        hiddenRows={1}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    const lines = linesOf(lastFrame() ?? "");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("p1");
    unmount();
  });

  test("hiddenRows past the separator clips content rows too", () => {
    const { lastFrame, unmount } = render(
      <ChatVisibleTurn
        turn={messageTurn("p1", "r1")}
        turnIndex={1}
        isFirstVisible={true}
        hiddenRows={2}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    const lines = linesOf(lastFrame() ?? "");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("r1");
    unmount();
  });
});
