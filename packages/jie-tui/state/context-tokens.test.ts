import { estimateContextTokens } from "./context-tokens";
import type { MessageCard, MessageBlock, MessageTurn } from "./state";

function card(input?: string, output?: string | null, error?: string | null): MessageCard {
  return { kind: "toolCall", callId: "c", name: "t", input, output, error };
}

function block(text: string): MessageBlock {
  return { kind: "text", text };
}

function turn(userPrompt: string, blocks: ReadonlyArray<MessageBlock> = [], cards: ReadonlyArray<MessageCard> = []): MessageTurn {
  return { userPrompt, blocks: [...blocks], cards: [...cards], streamId: null };
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
    expect(estimateContextTokens([], turn("", [], [card("abcd", "efghijkl")]))).toBe(3);
  });

  test("counts history across multiple turns", () => {
    const history: ReadonlyArray<MessageTurn> = [turn("aaaa"), turn("bbbb", [block("cccc")])];
    expect(estimateContextTokens(history, null)).toBe(3);
  });

  test("skips null tool output without throwing", () => {
    expect(estimateContextTokens([], turn("", [], [card("abcd", null)]))).toBe(1);
  });

  test("counts tool error text when output is null", () => {
    expect(estimateContextTokens([], turn("", [], [card("abcd", null, "err-msg")]))).toBe(3);
  });

  test("rounds up partial tokens (ceiling)", () => {
    expect(estimateContextTokens([], turn("abc"))).toBe(1);
    expect(estimateContextTokens([], turn("abcdefghij"))).toBe(3);
  });
});
