import type { AgentMessage } from "@cuzfrog/jie-platform";
import type { Usage } from "@earendil-works/pi-ai";
import { hydrateHistory } from "./hydrate-history";

function user(prompt: string): AgentMessage {
  return { role: "user", content: `[user]: ${prompt}`, timestamp: 0 };
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
    expect(hydrateHistory([])).toEqual({ history: [], currentTurn: null, todos: [] });
  });

  test("single completed turn becomes currentTurn with empty history", () => {
    const result = hydrateHistory([user("hello"), assistantText("world")]);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({
      userPrompt: "hello",
      cards: [],
      blocks: [{ kind: "text", text: "world" }],
      streamId: null,
    });
  });

  test("strips the [user]: ingress prefix from the user prompt", () => {
    const result = hydrateHistory([user("tell me a joke"), assistantText("ok")]);
    expect(result.currentTurn?.userPrompt).toBe("tell me a joke");
  });

  test("multiple turns rotate earlier ones into history", () => {
    const result = hydrateHistory([
      user("first"), assistantText("a1"),
      user("second"), assistantText("a2"),
    ]);
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.userPrompt).toBe("first");
    expect(result.history[0]?.blocks).toEqual([{ kind: "text", text: "a1" }]);
    expect(result.currentTurn?.userPrompt).toBe("second");
    expect(result.currentTurn?.blocks).toEqual([{ kind: "text", text: "a2" }]);
  });

  test("thinking and text become ordered blocks", () => {
    const result = hydrateHistory([user("q"), assistantThinkingThenText("hm", "ans")]);
    expect(result.currentTurn?.blocks).toEqual([
      { kind: "thinking", text: "hm" },
      { kind: "text", text: "ans" },
    ]);
  });

  test("tool call and result become a single toolResult card", () => {
    const result = hydrateHistory([
      user("run"), assistantToolCall("c1", "bash", { cmd: "ls" }), toolResult("c1", "bash", "file.txt"),
    ]);
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
    ]);
    const card = result.currentTurn?.cards[0];
    expect(card?.error).toBe("boom");
    expect(card?.output).toBeNull();
  });

  test("trailing user message leaves an open currentTurn for continue()", () => {
    const result = hydrateHistory([user("pending")]);
    expect(result.history).toEqual([]);
    expect(result.currentTurn).toEqual({ userPrompt: "pending", cards: [], blocks: [], streamId: null });
    expect(result.todos).toEqual([]);
  });

  test("restores todos from the last todo tool-result details", () => {
    const todos = [
      { content: "a", status: "completed" as const },
      { content: "b", status: "in_progress" as const, active_form: "doing b" },
    ];
    const result = hydrateHistory([
      user("plan"),
      assistantToolCall("c1", "todo", {}),
      toolResult("c1", "todo", "ok", false, { kind: "todos", todos }),
      assistantText("done"),
    ]);
    expect(result.todos).toEqual(todos);
  });
});
