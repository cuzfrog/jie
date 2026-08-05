import type { AfterToolCallContext, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { ToolCallObserverImpl, type ToolCallObserver } from "./tool-call-observer";
import type { AgentSender, EventEnvelope, EventManager } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const hookRunner = vi.mocked<HookRunner>({
  preToolUse: vi.fn(async () => ({ block: false, reason: null })),
  postToolUse: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
  userPromptSubmit: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
  sessionStart: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
});

const hookIdentity: HookIdentity = { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" };
const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

function makeObserver(): ToolCallObserver {
  return new ToolCallObserverImpl({ eventManager, hookRunner, hookIdentity, sender });
}

function makeAssistantMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

function makeAgentContext(): { systemPrompt: string; messages: [] } {
  return { systemPrompt: "", messages: [] };
}

function beforeCtx(overrides: Partial<BeforeToolCallContext> = {}): BeforeToolCallContext {
  return {
    assistantMessage: makeAssistantMessage(),
    toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
    args: { command: "ls" },
    context: makeAgentContext(),
    ...overrides,
  };
}

function afterCtx(overrides: Partial<AfterToolCallContext> = {}): AfterToolCallContext {
  return {
    assistantMessage: makeAssistantMessage(),
    toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
    args: { command: "ls" },
    context: makeAgentContext(),
    result: { content: [{ type: "text", text: "ok" }], details: {}, terminate: false },
    isError: false,
    ...overrides,
  };
}

function toolCallEvents(): EventEnvelope<"agent.tool.call">[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<"agent.tool.call"> => env.topic === "agent.tool.call");
}

function toolResultEvents(): EventEnvelope<"agent.tool.result">[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<"agent.tool.result"> => env.topic === "agent.tool.result");
}

describe("ToolCallObserver — tool-call publication", () => {
  test("beforeToolCall publishes agent.tool.call with wire-shaped input (short input not truncated)", async () => {
    await makeObserver().beforeToolCall(beforeCtx());
    expect(toolCallEvents()).toHaveLength(1);
    const payload = toolCallEvents()[0]!.payload;
    expect(payload.tool_call_id).toBe("c1");
    expect(payload.name).toBe("bash");
    expect(typeof payload.input).toBe("string");
    expect(payload.input_truncated).toBe(false);
  });

  test("beforeToolCall truncates long input with a marker", async () => {
    const long = "x".repeat(8000);
    await makeObserver().beforeToolCall(beforeCtx({
      toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: long } },
      args: { command: long },
    }));
    const payload = toolCallEvents()[0]!.payload;
    expect(payload.input_truncated).toBe(true);
    expect(payload.input).toContain("chars truncated");
    expect(payload.input.length).toBeLessThan(8000);
  });

  test("afterToolCall publishes agent.tool.result with the Jie ToolResult shape", async () => {
    await makeObserver().afterToolCall(afterCtx({
      toolCall: { type: "toolCall", id: "call_r", name: "noop", arguments: {} },
      result: { content: [{ type: "text", text: "hello" }], details: { foo: 1 }, terminate: false },
    }));
    const results = toolResultEvents();
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0]!.payload.output!)).toEqual({
      content: "hello",
      details: { foo: 1 },
      terminate: false,
    });
  });

  test("afterToolCall: multi-block content serializes as a JSON array", async () => {
    await makeObserver().afterToolCall(afterCtx({
      toolCall: { type: "toolCall", id: "call_m", name: "noop", arguments: {} },
      result: {
        content: [
          { type: "text", text: "a" },
          { type: "image", data: "x", mimeType: "image/png" },
        ],
        details: { ok: true },
        terminate: true,
      },
    }));
    expect(JSON.parse(toolResultEvents()[0]!.payload.output!)).toEqual({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "x", mimeType: "image/png" },
      ],
      details: { ok: true },
      terminate: true,
    });
  });

  test("afterToolCall on error: output null, error carries the message", async () => {
    await makeObserver().afterToolCall(afterCtx({
      toolCall: { type: "toolCall", id: "call_e", name: "noop", arguments: {} },
      result: { content: [{ type: "text", text: "boom" }], details: {}, terminate: false },
      isError: true,
    }));
    const env = toolResultEvents()[0]!;
    expect(env.payload.output).toBeNull();
    expect(env.payload.error).toBe("boom");
  });
});

describe("ToolCallObserver — hook gating", () => {
  test("beforeToolCall blocks the tool when the PreToolUse hook blocks", async () => {
    hookRunner.preToolUse.mockResolvedValue({ block: true, reason: "denied" });
    expect(await makeObserver().beforeToolCall(beforeCtx())).toEqual({ block: true, reason: "denied" });
  });

  test("beforeToolCall allows the tool and forwards identity + tool fields to the hook", async () => {
    expect(await makeObserver().beforeToolCall(beforeCtx())).toBeUndefined();
    expect(hookRunner.preToolUse).toHaveBeenCalledWith({
      identity: { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" },
      toolName: "bash",
      toolInput: { command: "ls" },
    });
  });

  test("afterToolCall marks the result an error when the PostToolUse hook blocks", async () => {
    hookRunner.postToolUse.mockResolvedValue({ block: true, reason: "bad", additionalContext: null });
    expect(await makeObserver().afterToolCall(afterCtx())).toEqual({ isError: true, content: [{ type: "text", text: "bad" }] });
  });

  test("afterToolCall appends additionalContext to the tool result content", async () => {
    hookRunner.postToolUse.mockResolvedValue({ block: false, reason: null, additionalContext: "note" });
    expect(await makeObserver().afterToolCall(afterCtx())).toEqual({
      content: [{ type: "text", text: "ok" }, { type: "text", text: "note" }],
    });
  });

  test("afterToolCall forwards the serialized tool response to the PostToolUse hook", async () => {
    await makeObserver().afterToolCall(afterCtx());
    expect(hookRunner.postToolUse).toHaveBeenCalledWith({
      identity: { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" },
      toolName: "bash",
      toolInput: { command: "ls" },
      toolResponse: JSON.stringify({ content: "ok", details: {}, terminate: false }),
    });
  });
});
