import type { AgentUiState, MessageTurn } from "../../state";
import {
  sliceChat,
  stepChatOffset,
  jumpChatOffset,
  turnHeight,
} from "./chat-scroll-model";
import { ASSISTANT_PREFIX, USER_PROMPT_PREFIX } from "../themes";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const OPTIONS = { toolCardsExpanded: false, thinkingExpanded: false };

function turn(overrides: Partial<MessageTurn> = {}): MessageTurn {
  return {
    userPrompt: "p",
    cards: [],
    blocks: [{ kind: "text", text: "r" }],
    streamId: null,
    ...overrides,
  };
}

function agent(turns: MessageTurn[], extras: Partial<AgentUiState> = {}): AgentUiState {
  return {
    agentId: "demo:g" as AgentUiState["agentId"],
    teamId: "demo",
    agentKey: "g",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history: turns,
    currentTurn: null,
    lastStopReason: null,
    ...extras,
  };
}

describe("turnHeight", () => {
  test("empty turn still consumes at least one row (separator)", () => {
    const h = turnHeight({ userPrompt: "", cards: [], blocks: [], streamId: null }, 80, OPTIONS);
    expect(h).toBeGreaterThanOrEqual(1);
  });

  test("long user prompt wraps to multiple rows", () => {
    const prompt = "a".repeat(200);
    const h = turnHeight(
      { userPrompt: prompt, cards: [], blocks: [], streamId: null },
      20,
      OPTIONS,
    );
    expect(h).toBeGreaterThan(2);
  });

  test("user-prompt prefix matches themes.USER_PROMPT_PREFIX glyph (single source of truth)", () => {
    // Smoke: the model reads its prefix from themes so it can never drift
    // out of sync with `<MessageView>`. The surrounding width-accounting
    // is owned by the shared wrap helper (planned for Step 7).
    expect(USER_PROMPT_PREFIX).toBe("› ");
  });

  test("assistant block prefix matches themes.ASSISTANT_PREFIX glyph (single source of truth)", () => {
    expect(ASSISTANT_PREFIX).toBe("● ");
  });

  test("long block wraps proportionally", () => {
    const short = turnHeight({ userPrompt: "", cards: [], blocks: [{ kind: "text", text: "hello" }], streamId: null }, 80, OPTIONS);
    const long = turnHeight({ userPrompt: "", cards: [], blocks: [{ kind: "text", text: "a".repeat(800) }], streamId: null }, 80, OPTIONS);
    expect(long).toBeGreaterThan(short);
  });

  test("thinking block collapsed consumes 1 row regardless of text length", () => {
    const h = turnHeight({ userPrompt: "", cards: [], blocks: [{ kind: "thinking", text: "a".repeat(1000) }], streamId: null }, 80, OPTIONS);
    expect(h).toBe(1);
  });

  test("tool card collapsed consumes 1 row", () => {
    const h = turnHeight({
      userPrompt: "",
      cards: [{ kind: "toolCall", callId: "c", name: "bash", input: "long input ".repeat(50) }],
      blocks: [],
      streamId: null,
    }, 80, OPTIONS);
    expect(h).toBe(1);
  });

  test("tool card expanded consumes more rows than collapsed", () => {
    const collapsed = turnHeight({
      userPrompt: "",
      cards: [{ kind: "toolResult", callId: "c", name: "bash", output: "out" }],
      blocks: [],
      streamId: null,
    }, 80, { toolCardsExpanded: false, thinkingExpanded: false });
    const expanded = turnHeight({
      userPrompt: "",
      cards: [{ kind: "toolResult", callId: "c", name: "bash", output: "out" }],
      blocks: [],
      streamId: null,
    }, 80, { toolCardsExpanded: true, thinkingExpanded: false });
    expect(expanded).toBeGreaterThan(collapsed);
  });
});

describe("sliceChat", () => {
  test("tail-pin with content fitting viewport yields tailOffset=0", () => {
    const a = agent([
      turn({ userPrompt: "p1", blocks: [{ kind: "text", text: "r1" }] }),
      turn({ userPrompt: "p2", blocks: [{ kind: "text", text: "r2" }] }),
    ]);
    const slice = sliceChat(a, 80, 50, 0, OPTIONS);
    expect(slice.tailOffset).toBe(0);
    expect(slice.atTail).toBe(true);
    expect(slice.atTop).toBe(true);
    expect(slice.visibleMetrics.length).toBe(2);
  });

  test("long history: offset at tail hides older turns", () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      turn({ userPrompt: `prompt-${i}`, blocks: [{ kind: "text", text: `reply ${"x".repeat(40)}` }] }),
    );
    const a = agent(turns);
    const slice = sliceChat(a, 80, 10, sliceTailOffset(turns.length, 10, a, OPTIONS, 80), OPTIONS);
    expect(slice.visibleMetrics.length).toBeLessThan(turns.length);
    expect(slice.scrollOffset).toBe(slice.tailOffset);
    expect(slice.atTail).toBe(true);
  });

  test("scrolled-up offset moves visible window away from the tail", () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      turn({ userPrompt: `prompt-${i}`, blocks: [{ kind: "text", text: `reply ${"x".repeat(40)}` }] }),
    );
    const a = agent(turns);
    const slice = sliceChat(a, 80, 10, 0, OPTIONS);
    expect(slice.atTop).toBe(true);
    expect(slice.atTail).toBe(false);
    expect(slice.scrollOffset).toBe(0);
  });

  test("truncatedFirsts records the rows hidden above the first visible turn", () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      turn({ userPrompt: `prompt-${i}`, blocks: [{ kind: "text", text: `reply ${"x".repeat(40)}` }] }),
    );
    const a = agent(turns);
    const slice = sliceChat(a, 80, 10, 1, OPTIONS);
    const first = slice.visibleMetrics[0];
    expect(first).toBeDefined();
    expect(slice.truncatedFirsts.get(first!.turnIndex)).toBe(1);
  });

  test("clamps requested offset above tailOffset to tailOffset and marks tail", () => {
    const turns = Array.from({ length: 5 }, (_, i) =>
      turn({ userPrompt: `prompt-${i}`, blocks: [{ kind: "text", text: `reply ${"x".repeat(40)}` }] }),
    );
    const a = agent(turns);
    const slice = sliceChat(a, 80, 10, 9999, OPTIONS);
    expect(slice.scrollOffset).toBe(slice.tailOffset);
    expect(slice.atTail).toBe(true);
  });

  test("busy agent adds a working indicator row", () => {
    const a = agent(
      [turn({ userPrompt: "p", blocks: [{ kind: "text", text: "r" }] })],
      { status: "busy", currentTurn: turn({ userPrompt: "", blocks: [] }) },
    );
    const slice = sliceChat(a, 80, 50, 0, OPTIONS);
    expect(slice.totalRows).toBeGreaterThan(slice.metrics[0]!.turnHeight);
  });
});

describe("stepChatOffset", () => {
  test("decrements offset (negative delta) and clamps at 0", () => {
    expect(stepChatOffset(10, -3, 100, 10)).toBe(7);
    expect(stepChatOffset(1, -10, 100, 10)).toBe(0);
  });

  test("clamps at tailOffset when stepping past the tail", () => {
    expect(stepChatOffset(80, 1000, 100, 10)).toBe(90);
  });

  test("zero delta preserves current offset", () => {
    expect(stepChatOffset(5, 0, 100, 10)).toBe(5);
  });
});

describe("jumpChatOffset", () => {
  test("'top' returns 0", () => {
    expect(jumpChatOffset("top", 100, 10)).toBe(0);
  });

  test("'tail' returns tailOffset", () => {
    expect(jumpChatOffset("tail", 100, 10)).toBe(90);
  });

  test("'tail' on content fitting viewport returns 0", () => {
    expect(jumpChatOffset("tail", 5, 10)).toBe(0);
  });
});

function sliceTailOffset(_unused: number, viewport: number, focused: AgentUiState, options: ChatScrollOptions_w, width: number): number {
  void _unused;
  void options;
  void focused;
  const slice = sliceChat(focused, width, viewport, 99999, { toolCardsExpanded: false, thinkingExpanded: false });
  return slice.tailOffset;
}
