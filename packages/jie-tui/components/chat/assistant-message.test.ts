import { visibleWidth } from "@earendil-works/pi-tui";
import { createContainer, InjectionMode } from "awilix";
import { Actions, registerStateModule, type MessageCard, type MessageTurn, type StateStore } from "../../state";
import { type TuiCradle } from "../../";
import { AssistantMessage } from "./assistant-message";

function makeStateStore(): StateStore {
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  registerStateModule(container);
  return container.cradle.stateStore;
}

function turn(partial: Partial<MessageTurn> = {}): MessageTurn {
  return { userPrompt: "q", cards: [], blocks: [], streamId: null, ...partial };
}

function card(partial: Partial<MessageCard> = {}): MessageCard {
  return { kind: "toolResult", callId: "c1", name: "bash", ...partial };
}

function boot(partial: Partial<MessageTurn> = {}): { store: StateStore; message: AssistantMessage } {
  const store = makeStateStore();
  return { store, message: new AssistantMessage(turn(partial), store) };
}

describe("AssistantMessage — text blocks", () => {
  test("renders nothing for a null turn", () => {
    const { message } = boot();
    message.update(null);
    expect(message.render(80)).toEqual([]);
  });

  test("renders nothing while the turn has no blocks or cards", () => {
    expect(boot().message.render(80)).toEqual([]);
  });

  test("renders markdown text with the assistant prefix on the first line", () => {
    const { message } = boot({ blocks: [{ kind: "text", text: "answer **bold**" }] });
    const lines = message.render(80);
    expect(lines[0].trimEnd()).toBe("\x1b[36m● \x1b[39manswer \x1b[1mbold\x1b[22m");
  });

  test("markdown headings render with the theme heading style", () => {
    const { message } = boot({ blocks: [{ kind: "text", text: "# Title" }] });
    const lines = message.render(80);
    expect(lines[0]).toContain("\x1b[36m");
    expect(lines[0]).toContain("Title");
  });

  test("only the first text block carries the prefix", () => {
    const { message } = boot({ blocks: [{ kind: "text", text: "one" }, { kind: "text", text: "two" }] });
    const lines = message.render(80).map((line) => line.trimEnd());
    expect(lines[0]).toBe("\x1b[36m● \x1b[39mone");
    expect(lines[1]).toBe("two");
  });

  test("skips empty text blocks", () => {
    const { message } = boot({ blocks: [{ kind: "text", text: "" }, { kind: "text", text: "real" }] });
    expect(message.render(80).map((line) => line.trimEnd())).toEqual(["\x1b[36m● \x1b[39mreal"]);
  });

  test("update streams new text through the same markdown instance", () => {
    const { message } = boot({ blocks: [{ kind: "text", text: "a" }] });
    message.update(turn({ blocks: [{ kind: "text", text: "ab" }] }));
    expect(message.render(80).map((line) => line.trimEnd())).toEqual(["\x1b[36m● \x1b[39mab"]);
  });
});

describe("AssistantMessage — thinking blocks", () => {
  test("collapsed by default: a single dim label line", () => {
    const { message } = boot({ blocks: [{ kind: "thinking", text: "pondering" }] });
    expect(message.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m"]);
  });

  test("expanded after ctrl+t: label plus dim text", () => {
    const { store, message } = boot({ blocks: [{ kind: "thinking", text: "pondering" }] });
    store.dispatch(Actions.toggleThinking());
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[90mThinking...\x1b[39m");
    expect(lines[1]).toBe("\x1b[90mpondering\x1b[39m");
  });
});

describe("AssistantMessage — tool cards", () => {
  test("collapsed by default: header line only", () => {
    const { message } = boot({ cards: [card({ output: "ok" })] });
    expect(message.render(80)).toEqual(["\x1b[37m✓ bash\x1b[39m"]);
  });

  test("expanded after ctrl+o: header plus output section", () => {
    const { store, message } = boot({ cards: [card({ output: "ok" })] });
    store.dispatch(Actions.toggleToolCards());
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[37m✓ bash\x1b[39m");
    expect(lines[1]).toBe("\x1b[90moutput:\x1b[39m");
    expect(lines[2]).toBe("\x1b[90mok\x1b[39m");
  });
});

describe("AssistantMessage — width contract", () => {
  test("never renders a line wider than the given width (doRender guard)", () => {
    const { store, message } = boot({
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
    });
    store.dispatch(Actions.toggleThinking());
    store.dispatch(Actions.toggleToolCards());
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of message.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
