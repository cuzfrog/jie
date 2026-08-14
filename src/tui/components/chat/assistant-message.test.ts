import { visibleWidth } from "@earendil-works/pi-tui";
import type { ToolResultDetails } from "../../../platform";
import { type MessageCard, type MessageTurn, type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { AssistantMessage, _summarizeWork } from "./assistant-message";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

beforeEach(() => {
  stateStore.getState.mockReturnValue(makeTuiState());
});

function turn(partial: Partial<MessageTurn> = {}): MessageTurn {
  return { userPrompt: "q", cards: [], blocks: [], streamId: null, seq: 0, ...partial };
}

function card(partial: Partial<MessageCard> = {}): MessageCard {
  return { kind: "toolResult", callId: "c1", name: "bash", ...partial };
}

function diffDetails(diff: string | null): ToolResultDetails {
  return { kind: "diff", path: "a.txt", replacementsCount: 1, beforeBytes: 2, afterBytes: 2, diff };
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
  test("collapsed by default: a streaming block folds into a live summary line", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "pondering" }] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (0ms)\x1b[39m"]);
  });

  test("expanded after ctrl+t: label plus dim text", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "pondering" }] }), stateStore);
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[90mThinking...\x1b[39m");
    expect(lines[1]).toBe("\x1b[90mpondering\x1b[39m");
  });

  test("redacted thinking with empty text still contributes its duration to the summary", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "", durationMs: 1000 }] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThought for 1s\x1b[39m"]);
  });

  test("redacted thinking with empty text does not render an individual block when expanded", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "thinking", text: "", durationMs: 1000 },
        { kind: "text", text: "answer" },
      ],
    }), stateStore);
    expect(message.render(80).map((line) => line.trimEnd())).toEqual([
      "\x1b[36m● \x1b[39manswer",
      "\x1b[90mThought for 1s\x1b[39m",
    ]);
  });
});

describe("AssistantMessage — tool cards", () => {
  test("completed results fold into the work summary", () => {
    const message = new AssistantMessage(turn({ cards: [card({ output: "ok" })] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mused bash 1 time\x1b[39m"]);
  });

  test("expanded after ctrl+o: header plus output section", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const message = new AssistantMessage(turn({ cards: [card({ output: "ok" })] }), stateStore);
    const lines = message.render(80);
    expect(lines[0]).toBe("\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m");
    expect(lines[1]).toBe("\x1b[90moutput:\x1b[39m");
    expect(lines[2]).toBe("\x1b[90mok\x1b[39m");
  });
});

describe("AssistantMessage — work summary", () => {
  test("completed thinking blocks collapse into a single total line", () => {
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "thinking", text: "a", durationMs: 19600 },
        { kind: "thinking", text: "b", durationMs: 37000 },
      ],
    }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThought for 57s\x1b[39m"]);
  });

  test("a streaming thinking block folds its live elapsed into the summary", () => {
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "thinking", text: "a", durationMs: 1000 },
        { kind: "thinking", text: "streaming" },
      ],
    }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (1s)\x1b[39m"]);
  });

  test("completed tool results fold into usage counts", () => {
    const message = new AssistantMessage(turn({
      cards: [card({ durationMs: 12 }), card({ durationMs: 8 }), card({ name: "read_file", durationMs: 3 })],
    }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mused bash 2 times, used read_file 1 time\x1b[39m"]);
  });

  test("thinking and tool usage combine into one summary", () => {
    const message = new AssistantMessage(turn({
      blocks: [{ kind: "thinking", text: "deep", durationMs: 56600 }],
      cards: [card({ name: "read_file", durationMs: 400 })],
    }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThought for 57s, used read_file 1 time\x1b[39m"]);
  });

  test("error cards stay individual", () => {
    const message = new AssistantMessage(turn({ cards: [card({ error: "boom" })] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[31m✗\x1b[39m \x1b[31mbash\x1b[39m"]);
  });

  test("running tool calls stay individual", () => {
    const message = new AssistantMessage(turn({ cards: [card({ kind: "toolCall" })] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m"]);
  });

  test("diff cards stay individual and show their diff block", () => {
    const message = new AssistantMessage(turn({ cards: [card({ details: diffDetails("+a") })] }), stateStore);
    expect(message.render(80)).toEqual([
      "\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m",
      "\x1b[32m+a\x1b[39m",
    ]);
  });

  test("ctrl+t restores the individual thinking blocks", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "thinking", text: "a", durationMs: 100 },
        { kind: "thinking", text: "b", durationMs: 200 },
      ],
    }), stateStore);
    expect(message.render(80)).toEqual([
      "\x1b[90mThought for 100ms\x1b[39m",
      "\x1b[90ma\x1b[39m",
      "\x1b[90mThought for 200ms\x1b[39m",
      "\x1b[90mb\x1b[39m",
    ]);
  });

  test("ctrl+o restores the individual tool cards", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const message = new AssistantMessage(turn({ cards: [card({ durationMs: 12 }), card({ durationMs: 8 })] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[32m✓\x1b[39m \x1b[37mbash  12ms\x1b[39m", "\x1b[32m✓\x1b[39m \x1b[37mbash  8ms\x1b[39m"]);
  });

  test("the summary follows the diff blocks", () => {
    const message = new AssistantMessage(turn({
      blocks: [{ kind: "text", text: "answer" }],
      cards: [card({ details: diffDetails("@@ -1,1 +1,1 @@\n-a\n+b") }), card({ durationMs: 500 })],
    }), stateStore);
    expect(message.render(80).map((line) => line.trimEnd())).toEqual([
      "\x1b[36m● \x1b[39manswer",
      "\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m",
      "\x1b[90m@@ -1,1 +1,1 @@\x1b[39m",
      "\x1b[90m1 \x1b[39m\x1b[31m- a\x1b[39m",
      "\x1b[90m1 \x1b[39m\x1b[32m+ b\x1b[39m",
      "\x1b[90mused bash 1 time\x1b[39m",
    ]);
  });

  test("the summary follows the text blocks and individual cards", () => {
    const message = new AssistantMessage(turn({
      blocks: [{ kind: "text", text: "answer" }, { kind: "thinking", text: "deep", durationMs: 1000 }],
      cards: [card({ error: "boom" }), card({ durationMs: 500 })],
    }), stateStore);
    expect(message.render(80).map((line) => line.trimEnd())).toEqual([
      "\x1b[36m● \x1b[39manswer",
      "\x1b[31m✗\x1b[39m \x1b[31mbash\x1b[39m",
      "\x1b[90mThought for 1s, used bash 1 time\x1b[39m",
    ]);
  });
});

describe("summarizeWork", () => {
  test("returns null when nothing is aggregated", () => {
    expect(_summarizeWork(null, [], null)).toBeNull();
  });

  test("renders only usage when no thinking time is known", () => {
    expect(_summarizeWork(null, [card()], null)).toBe("used bash 1 time");
  });

  test("keeps the order of first completion", () => {
    const cards = [card({ name: "read_file" }), card(), card({ name: "read_file" })];
    expect(_summarizeWork(null, cards, null)).toBe("used read_file 2 times, used bash 1 time");
  });

  test("renders a completed thought line with usage", () => {
    expect(_summarizeWork(1000, [card({ durationMs: 500 })], null)).toBe("Thought for 1s, used bash 1 time");
  });

  test("a live elapsed shows the thinking label with the running total", () => {
    expect(_summarizeWork(1000, [], 500)).toBe("Thinking... (2s)");
  });

  test("a live elapsed from zero prior thinking still counts up", () => {
    expect(_summarizeWork(null, [], 500)).toBe("Thinking... (500ms)");
  });

  test("a live elapsed combines with tool usage", () => {
    expect(_summarizeWork(1000, [card()], 500)).toBe("Thinking... (2s), used bash 1 time");
  });
});

describe("AssistantMessage - live thinking counter", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts at zero and grows with elapsed time", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "pondering" }] }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (0ms)\x1b[39m"]);
    vi.advanceTimersByTime(1500);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (2s)\x1b[39m"]);
  });

  test("accumulates with completed thinking", () => {
    const message = new AssistantMessage(turn({
      blocks: [
        { kind: "thinking", text: "a", durationMs: 1000 },
        { kind: "thinking", text: "streaming" },
      ],
    }), stateStore);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (1s)\x1b[39m"]);
    vi.advanceTimersByTime(500);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (2s)\x1b[39m"]);
  });

  test("resets when a new in-progress block takes over", () => {
    const message = new AssistantMessage(turn({ blocks: [{ kind: "thinking", text: "first" }] }), stateStore);
    message.render(80);
    vi.advanceTimersByTime(2000);
    message.update(turn({
      blocks: [
        { kind: "thinking", text: "first", durationMs: 2000 },
        { kind: "thinking", text: "second" },
      ],
    }));
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (2s)\x1b[39m"]);
    vi.advanceTimersByTime(500);
    expect(message.render(80)).toEqual(["\x1b[90mThinking... (3s)\x1b[39m"]);
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
        details: diffDetails(`+${"x".repeat(300)}`),
      })],
    }), stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of message.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  test("never renders the summary wider than the given width", () => {
    const message = new AssistantMessage(turn({
      blocks: [{ kind: "thinking", text: "x".repeat(300), durationMs: 99_999 }],
      cards: [card({ name: "x".repeat(300), durationMs: 99_999 })],
    }), stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of message.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
