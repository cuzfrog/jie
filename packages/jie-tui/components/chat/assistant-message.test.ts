import { visibleWidth } from "@earendil-works/pi-tui";
import { type MessageCard, type MessageTurn, type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { AssistantMessage } from "./assistant-message";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

beforeEach(() => {
  stateStore.getState.mockReturnValue(makeTuiState());
});

function turn(partial: Partial<MessageTurn> = {}): MessageTurn {
  return { userPrompt: "q", cards: [], blocks: [], streamId: null, ...partial };
}

function card(partial: Partial<MessageCard> = {}): MessageCard {
  return { kind: "toolResult", callId: "c1", name: "bash", ...partial };
}

describe("AssistantMessage — text blocks", () => {
  test("renders nothing for a null turn", () => {
    const message = new AssistantMessage(turn(), stateStore);
    message.update(null);
    expect(message.render(80)).toEqual([]);
  });

  test("renders nothing while the turn has no blocks or cards", () => {
    expect(new AssistantMessage(turn(), stateStore).render(80)).toEqual([]);
  });

  test("renders markdown text with the assistant prefix on the first line", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "text", text: "answer **bold**" }] }), stateStore);
    const lines = message.render(80);
    expect(lines[0].trimEnd()).toBe("\x1b[36m● \x1b[39manswer \x1b[1mbold\x1b[22m");
  });

  test("markdown headings render with the theme heading style", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "text", text: "# Title" }] }), stateStore);
    const lines = message.render(80);
    expect(lines[0]).toContain("\x1b[36m");
    expect(lines[0]).toContain("Title");
  });

  test("only the first text block carries the prefix", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "text", text: "one" }, { kind: "text", text: "two" }] }), stateStore);
    const lines = message.render(80).map((line) => line.trimEnd());
    expect(lines[0]).toBe("\x1b[36m● \x1b[39mone");
    expect(lines[1]).toBe("two");
  });

  test("skips empty text blocks", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "text", text: "" }, { kind: "text", text: "real" }] }), stateStore);
    expect(message.render(80).map((line) => line.trimEnd())).toEqual(["\x1b[36m● \x1b[39mreal"]);
  });

  test("update streams new text through the same markdown instance", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "text", text: "a" }] }), stateStore);
    message.update(turn({ blocks: [{ kind: "text", text: "ab" }] }));
    expect(message.render(80).map((line) => line.trimEnd())).toEqual(["\x1b[36m● \x1b[39mab"]);
  });
});

describe("AssistantMessage — thinking blocks", () => {
  test("collapsed by default: a single dim label line", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "pondering" }] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m"]);
  });

  test("expanded after ctrl+t: label plus dim text", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "pondering" }] }), stateStore);
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[90mThinking...\x1b[39m");
    expect(lines[1]).toBe("\x1b[90mpondering\x1b[39m");
  });
});

describe("AssistantMessage — tool cards", () => {
  test("collapsed by default: header line only", () => {
    const message = new AssistantMessage(turn({ cards: [card({ output: "ok" })] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[37m✓ bash\x1b[39m"]);
  });

  test("expanded after ctrl+o: header plus output section", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const message = new AssistantMessage(turn({ cards: [card({ output: "ok" })] }), stateStore);
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[37m✓ bash\x1b[39m");
    expect(lines[1]).toBe("\x1b[90moutput:\x1b[39m");
    expect(lines[2]).toBe("\x1b[90mok\x1b[39m");
  });
});

describe("AssistantMessage — width contract", () => {
  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true, toolCardsExpanded: true }));
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "text", text: `${"x".repeat(300)}\n${"中文🎉".repeat(40)}` },
        { kind: "thinking", text: "x".repeat(300) },
      ],
      cards: [card({
        name: "x".repeat(300),
        input: "x".repeat(300),
        output: "中文🎉".repeat(40),
        details: { kind: "diff", diff: `+${"x".repeat(300)}` },
      })],
    }), stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of message.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
