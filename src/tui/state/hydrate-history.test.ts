import type { AgentMessage, ToolResultDetails, UserIngressMessage } from "../../platform";
import type { Usage } from "@earendil-works/pi-ai";
import { hydrateHistory } from "./hydrate-history";
import type { MessageBlock, MessageCard, MessageTurn } from "./state";

function user(prompt: string): AgentMessage {
  return { role: "user", content: prompt, timestamp: 0 };
}
function userWithDisplay(displayText: string, expandedContent: string): AgentMessage {
  const message: UserIngressMessage = { role: "user", content: expandedContent, timestamp: 0, displayText };
  return message;
}
function assistantText(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
  };
}
function assistantThinkingThenText(thinking: string, text: string, thinkingDurationMs?: number): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "thinking", thinking, thinkingDurationMs }, { type: "text", text }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
  };
}
function assistantToolCall(id: string, name: string, args: Record<string, unknown>): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "toolUse", timestamp: 0,
  };
}
function toolResult(toolCallId: string, toolName: string, text: string, isError = false, details?: ToolResultDetails | null): AgentMessage {
  return { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError, details, timestamp: 0 };
}
function compactionSummary(summary: string, tokensBefore: number): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore, timestamp: 0 };
}
function usage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("hydrateHistory", () => {
  test("empty messages yields empty history and null current turn", () => {
    expect(hydrateHistory([], 0)).toEqual({ history: [], currentTurn: null, compactionMarker: null, nextSeq: 0 });
  });

  test("single completed turn becomes currentTurn with empty history", () => {
    const result = hydrateHistory([user("hello"), assistantText("world")], 0);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({
      userPrompt: "hello",
      entries: [{ kind: "text", text: "world" }],
      streamId: null,
      seq: 0,
    });
    expect(result.nextSeq).toBe(1);
  });

  test("uses bare content as the user prompt", () => {
    const result = hydrateHistory([user("tell me a joke"), assistantText("ok")], 0);
    expect(result.currentTurn?.userPrompt).toBe("tell me a joke");
  });

  test("prefers displayText over the expanded content for the user prompt", () => {
    const expanded = '<skill name="deploy" location="/deploy/SKILL.md">\nRun the deploy pipeline.\n</skill>';
    const result = hydrateHistory([userWithDisplay("/skill:deploy now", expanded), assistantText("ok")], 0);
    expect(result.currentTurn?.userPrompt).toBe("/skill:deploy now");
  });

  test("derives the prompt from content when displayText is absent", () => {
    const result = hydrateHistory([user('<skill name="deploy">body</skill>'), assistantText("ok")], 0);
    expect(result.currentTurn?.userPrompt).toBe('<skill name="deploy">body</skill>');
  });

  test("multiple turns rotate earlier ones into history, numbered from startSeq", () => {
    const result = hydrateHistory([
      user("first"), assistantText("a1"),
      user("second"), assistantText("a2"),
    ], 5);
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.userPrompt).toBe("first");
    expect(result.history[0]?.entries).toEqual([{ kind: "text", text: "a1" }]);
    expect(result.history[0]?.seq).toBe(5);
    expect(result.currentTurn?.userPrompt).toBe("second");
    expect(result.currentTurn?.entries).toEqual([{ kind: "text", text: "a2" }]);
    expect(result.currentTurn?.seq).toBe(6);
    expect(result.nextSeq).toBe(7);
  });

  test("thinking and text become ordered blocks", () => {
    const result = hydrateHistory([user("q"), assistantThinkingThenText("hm", "ans", 250)], 0);
    expect(result.currentTurn?.entries).toEqual([
      { kind: "thinking", text: "hm", durationMs: 250 },
      { kind: "text", text: "ans" },
    ]);
  });

  test("thinking without a duration defaults to 0ms", () => {
    const result = hydrateHistory([user("q"), assistantThinkingThenText("hm", "ans")], 0);
    expect(result.currentTurn?.entries).toEqual([
      { kind: "thinking", text: "hm", durationMs: 0 },
      { kind: "text", text: "ans" },
    ]);
  });

  test("redacted thinking with a duration produces an empty-text block carrying that duration", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "", thinkingDurationMs: 1000 }, { type: "text", text: "ans" }],
      api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
    };
    const result = hydrateHistory([user("q"), message], 0);
    expect(result.currentTurn?.entries).toEqual([
      { kind: "thinking", text: "", durationMs: 1000 },
      { kind: "text", text: "ans" },
    ]);
  });

  test("redacted thinking without a recorded duration is dropped", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "", redacted: true }, { type: "text", text: "ans" }],
      api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
    };
    const result = hydrateHistory([user("q"), message], 0);
    expect(result.currentTurn?.entries).toEqual([{ kind: "text", text: "ans" }]);
  });

  test("adjacent thinking parts merge and sum their durations", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "a", thinkingDurationMs: 100 },
        { type: "thinking", thinking: "b", thinkingDurationMs: 200 },
        { type: "text", text: "ans" },
      ],
      api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
    };
    const result = hydrateHistory([user("q"), message], 0);
    expect(result.currentTurn?.entries).toEqual([
      { kind: "thinking", text: "ab", durationMs: 300 },
      { kind: "text", text: "ans" },
    ]);
  });

  test("tool call and result become a single toolResult card", () => {
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", { cmd: "ls" }), toolResult("c1", "bash", "file.txt"),
    ], 0);
    expect(result.currentTurn?.entries).toEqual([{
      kind: "toolResult",
      callId: "c1",
      name: "bash",
      input: JSON.stringify({ cmd: "ls" }),
      inputTruncated: false,
      output: "file.txt",
      outputTruncated: false,
      durationMs: undefined,
      error: null,
      details: null,
    }]);
  });

  test("tool result details pass through to the card", () => {
    const details: ToolResultDetails = { kind: "diff", path: "a.txt", replacementsCount: 1, beforeBytes: 2, afterBytes: 3, diff: "-x\n+y" };
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "edit", {}), toolResult("c1", "edit", "ok", false, details),
    ], 0);
    expect(firstCard(result.currentTurn)?.details).toEqual(details);
  });

  test("non-diff details are dropped at the persisted-message seam", () => {
    const kanban: ToolResultDetails = { kind: "kanban", cards: [] };
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "write_kanban", {}), toolResult("c1", "write_kanban", "ok", false, kanban),
    ], 0);
    expect(firstCard(result.currentTurn)?.details).toBeNull();
  });

  test("malformed details are dropped at the persisted-message seam", () => {
    const message: AgentMessage = {
      role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "ok" }], isError: false, details: "garbage", timestamp: 0,
    };
    const result = hydrateHistory([user("run"), assistantToolCall("c1", "bash", {}), message], 0);
    expect(firstCard(result.currentTurn)?.details).toBeNull();
  });

  test("tool error sets error and nulls output", () => {
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", {}), toolResult("c1", "bash", "boom", true),
    ], 0);
    const card = firstCard(result.currentTurn);
    expect(card?.error).toBe("boom");
    expect(card?.output).toBeNull();
  });

  test("long tool input and output are middle-truncated with the truncated flag", () => {
    const longInput = "a".repeat(5000);
    const longOutput = "b".repeat(5000);
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", { cmd: longInput }), toolResult("c1", "bash", longOutput),
    ], 0);
    const card = firstCard(result.currentTurn);
    expect(card?.inputTruncated).toBe(true);
    expect(card?.outputTruncated).toBe(true);
    expect(card?.input).toContain("...[");
    expect(card?.output).toContain("...[");
    expect(card?.input).not.toBe(longInput);
    expect(card?.output).not.toBe(longOutput);
  });

  test("trailing user message leaves an open currentTurn for continue()", () => {
    const result = hydrateHistory([user("pending")], 0);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({ userPrompt: "pending", entries: [], streamId: null, seq: 0 });
  });

  test("a leading compaction summary becomes the marker and turns number after it", () => {
    const result = hydrateHistory([
      compactionSummary("the summary", 500),
      user("kept"), assistantText("a1"),
      user("kept2"), assistantText("a2"),
    ], 7);
    expect(result.compactionMarker).toEqual({ turnsBefore: 0, summary: "the summary", tokensBefore: 500 });
    expect(result.history[0]?.seq).toBe(7);
    expect(result.currentTurn?.seq).toBe(8);
    expect(result.nextSeq).toBe(9);
  });

  test("a summary between completed turns records the turnsBefore count", () => {
    const result = hydrateHistory([
      user("first"), assistantText("a1"),
      compactionSummary("the summary", 500),
      user("kept"), assistantText("a2"),
    ], 0);
    expect(result.compactionMarker).toEqual({ turnsBefore: 1, summary: "the summary", tokensBefore: 500 });
    expect(result.history[0]?.userPrompt).toBe("first");
    expect(result.currentTurn?.userPrompt).toBe("kept");
  });

  test("a summary-only transcript yields just the marker", () => {
    const result = hydrateHistory([compactionSummary("the summary", 500)], 3);
    expect(result).toEqual({
      history: [],
      currentTurn: null,
      compactionMarker: { turnsBefore: 0, summary: "the summary", tokensBefore: 500 },
      nextSeq: 3,
    });
  });
});

function isToolCard(entry: MessageBlock | MessageCard): entry is MessageCard {
  return entry.kind === "toolCall" || entry.kind === "toolResult";
}

function firstCard(turn: MessageTurn | null | undefined): MessageCard | undefined {
  return turn?.entries.find(isToolCard);
}
