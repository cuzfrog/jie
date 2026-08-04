import type { AgentMessage, UserIngressMessage } from "@cuzfrog/jie-platform";
import type { Usage } from "@earendil-works/pi-ai";
import { hydrateHistory } from "./hydrate-history";

function user(prompt: string): AgentMessage {
  return { role: "user", content: `[user]: ${prompt}`, timestamp: 0 };
}
function userWithDisplay(displayText: string, expandedContent: string): AgentMessage {
  const message: UserIngressMessage = { role: "user", content: `[user]: ${expandedContent}`, timestamp: 0, displayText };
  return message;
}
function assistantText(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
  };
}
function assistantThinkingThenText(thinking: string, text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "thinking", thinking }, { type: "text", text }],
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
function toolResult(toolCallId: string, toolName: string, text: string, isError = false, details?: unknown): AgentMessage {
  return { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError, details, timestamp: 0 };
}
function usage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("hydrateHistory", () => {
  test("empty messages yields empty history and null current turn", () => {
    expect(hydrateHistory([], 0)).toEqual({ history: [], currentTurn: null, cards: [], nextSeq: 0 });
  });

  test("single completed turn becomes currentTurn with empty history", () => {
    const result = hydrateHistory([user("hello"), assistantText("world")], 0);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({
      userPrompt: "hello",
      cards: [],
      blocks: [{ kind: "text", text: "world" }],
      streamId: null,
      seq: 0,
    });
    expect(result.nextSeq).toBe(1);
  });

  test("strips the [user]: ingress prefix from the user prompt", () => {
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
    expect(result.history[0]?.blocks).toEqual([{ kind: "text", text: "a1" }]);
    expect(result.history[0]?.seq).toBe(5);
    expect(result.currentTurn?.userPrompt).toBe("second");
    expect(result.currentTurn?.blocks).toEqual([{ kind: "text", text: "a2" }]);
    expect(result.currentTurn?.seq).toBe(6);
    expect(result.nextSeq).toBe(7);
  });

  test("thinking and text become ordered blocks", () => {
    const result = hydrateHistory([user("q"), assistantThinkingThenText("hm", "ans")], 0);
    expect(result.currentTurn?.blocks).toEqual([
      { kind: "thinking", text: "hm" },
      { kind: "text", text: "ans" },
    ]);
  });

  test("tool call and result become a single toolResult card", () => {
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", { cmd: "ls" }), toolResult("c1", "bash", "file.txt"),
    ], 0);
    expect(result.currentTurn?.cards).toEqual([{
      kind: "toolResult",
      callId: "c1",
      name: "bash",
      input: JSON.stringify({ cmd: "ls" }),
      inputTruncated: false,
      output: "file.txt",
      outputTruncated: false,
      durationMs: undefined,
      error: null,
      details: undefined,
    }]);
  });

  test("tool error sets error and nulls output", () => {
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", {}), toolResult("c1", "bash", "boom", true),
    ], 0);
    const card = result.currentTurn?.cards[0];
    expect(card?.error).toBe("boom");
    expect(card?.output).toBeNull();
  });

  test("trailing user message leaves an open currentTurn for continue()", () => {
    const result = hydrateHistory([user("pending")], 0);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({ userPrompt: "pending", cards: [], blocks: [], streamId: null, seq: 0 });
    expect(result.cards).toEqual([]);
  });

  test("restores cards from the last kanban tool-result details", () => {
    const cards = [
      { content: "a", status: "completed" as const },
      { content: "b", status: "in_progress" as const, active_form: "doing b" },
    ];
    const result = hydrateHistory([
      user("plan"),
      assistantToolCall("c1", "kanban", {}),
      toolResult("c1", "kanban", "ok", false, { kind: "kanban", cards }),
      assistantText("done"),
    ], 0);
    expect(result.cards).toEqual(cards);
  });
});
