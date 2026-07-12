import { render } from "../../test-renderer";
import { MessageView } from "./message-view";
import type { MessageTurn } from "../../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function turn(overrides: Partial<MessageTurn> = {}): MessageTurn {
  return {
    userPrompt: "hi",
    cards: [],
    blocks: [{ kind: "text", text: "hello" }],
    streamId: null,
    ...overrides,
  };
}

describe("MessageView", () => {
  test("renders user prompt with the › prefix", () => {
    const { lastFrame, unmount } = render(
      <MessageView turn={turn({ userPrompt: "ask" })} thinkingExpanded={false} toolCardsExpanded={false} />,
    );
    expect(lastFrame()).toContain("› ask");
    unmount();
  });

  test("renders assistant block text", () => {
    const { lastFrame, unmount } = render(
      <MessageView turn={turn({ blocks: [{ kind: "text", text: "answer" }] })} thinkingExpanded={false} toolCardsExpanded={false} />,
    );
    expect(lastFrame()).toContain("answer");
    unmount();
  });

  test("renders a thinking block as 'Thinking...' when collapsed", () => {
    const { lastFrame, unmount } = render(
      <MessageView turn={turn({ blocks: [{ kind: "thinking", text: "thought body" }] })} thinkingExpanded={false} toolCardsExpanded={false} />,
    );
    expect(lastFrame()).toContain("Thinking...");
    expect(lastFrame()).not.toContain("thought body");
    unmount();
  });

  test("expands a thinking block when expanded", () => {
    const { lastFrame, unmount } = render(
      <MessageView turn={turn({ blocks: [{ kind: "thinking", text: "thought body" }] })} thinkingExpanded={true} toolCardsExpanded={false} />,
    );
    expect(lastFrame()).toContain("thought body");
    unmount();
  });

  test("renders tool cards when present", () => {
    const { lastFrame, unmount } = render(
      <MessageView
        turn={turn({
          cards: [{ kind: "toolCall", callId: "1", name: "ls", output: null }],
          blocks: [],
        })}
        thinkingExpanded={false}
        toolCardsExpanded={false}
      />,
    );
    expect(lastFrame()).toContain("ls");
    unmount();
  });
});