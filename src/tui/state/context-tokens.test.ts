import { contextHistory, estimateContextTokens } from "./context-tokens";
import type { AgentUiState, MessageCard, MessageBlock, MessageTurn } from "./state";

function card(input?: string, output?: string | null, error?: string | null): MessageCard {
  return { kind: "toolCall", callId: "c", name: "t", input, output, error };
}

function block(text: string): MessageBlock {
  return { kind: "text", text };
}

function turn(userPrompt: string, entries: ReadonlyArray<MessageBlock | MessageCard> = []): MessageTurn {
  return { userPrompt, entries: [...entries], streamId: null, seq: 0 };
}

describe("estimateContextTokens", () => {
  test("returns 0 for empty history and no current turn", () => {
    expect(estimateContextTokens([], null)).toBe(0);
  });

  test("counts the current-turn user prompt", () => {
    expect(estimateContextTokens([], turn("hello world"))).toBe(3);
  });

  test("counts assistant text blocks in current turn", () => {
    expect(estimateContextTokens([], turn("", [block("abcdefgh")]))).toBe(2);
  });

  test("counts tool call input and output in current turn", () => {
    expect(estimateContextTokens([], turn("", [card("abcd", "efghijkl")]))).toBe(3);
  });

  test("counts history across multiple turns", () => {
    const history: ReadonlyArray<MessageTurn> = [turn("aaaa"), turn("bbbb", [block("cccc")])];
    expect(estimateContextTokens(history, null)).toBe(3);
  });

  test("skips null tool output without throwing", () => {
    expect(estimateContextTokens([], turn("", [card("abcd", null)]))).toBe(1);
  });

  test("counts tool error text when output is null", () => {
    expect(estimateContextTokens([], turn("", [card("abcd", null, "err-msg")]))).toBe(3);
  });

  test("rounds up partial tokens (ceiling)", () => {
    expect(estimateContextTokens([], turn("abc"))).toBe(1);
    expect(estimateContextTokens([], turn("abcdefghij"))).toBe(3);
  });
});

describe("contextHistory", () => {
  function agentState(history: MessageTurn[], marker: AgentUiState["compactionMarker"] = null): AgentUiState {
    return {
      agentId: "t:1",
      teamId: "t",
      agentKey: "1",
      role: "general",
      isLeader: true,
      tools: [],
      subscribe: [],
      skills: [],
      status: "idle",
      model: null,
      queue: [],
      history,
      currentTurn: null,
      compactionMarker: marker,
      compactionInProgress: false,
      lastStopReason: null,
      contextTokensUsed: 0,
      lastReportedTotalTokens: null,
      sessionInputTokens: 0,
      sessionOutputTokens: 0,
      inflightInputTokens: 0,
      inflightOutputTokens: 0,
      workStartedAt: null,
    };
  }

  test("returns the full history when there is no compaction marker", () => {
    const history = [turn("a"), turn("b")];
    expect(contextHistory(agentState(history))).toEqual(history);
  });

  test("returns the history suffix after the marker", () => {
    const history = [turn("a"), turn("b"), turn("c")];
    const marker = { turnsBefore: 2, summary: "s", tokensBefore: 1 };
    expect(contextHistory(agentState(history, marker))).toEqual([turn("c")]);
  });

  test("clamps a marker beyond the history length", () => {
    const history = [turn("a"), turn("b")];
    const marker = { turnsBefore: 10, summary: "s", tokensBefore: 1 };
    expect(contextHistory(agentState(history, marker))).toEqual([]);
  });
});
