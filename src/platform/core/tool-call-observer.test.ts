import type { AgentMessage, AfterToolCallContext, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
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

beforeEach(() => {
  hookRunner.preToolUse.mockResolvedValue({ block: false, reason: null });
});

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

function makeAgentContext(messages: AgentMessage[] = []): { systemPrompt: string; messages: AgentMessage[] } {
  return { systemPrompt: "", messages };
}

function userMessage(content: string, timestamp: number): AgentMessage {
  return { role: "user", content, timestamp };
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

function systemErrors(): EventEnvelope<"system.error">[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<"system.error"> => env.topic === "system.error");
}

function agentInterrupts(): EventEnvelope<"agent.interrupt">[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<"agent.interrupt"> => env.topic === "agent.interrupt");
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

describe("ToolCallObserver — loop guard", () => {
  function makeLoopCtx(
    args: Record<string, unknown>,
    toolName = "ls",
    messages: AgentMessage[] = [userMessage("loop", 1)],
  ): BeforeToolCallContext {
    return beforeCtx({
      toolCall: { type: "toolCall", id: `call-${toolName}`, name: toolName, arguments: args },
      args,
      context: makeAgentContext(messages),
    });
  }

  test("three identical calls pass through and the fourth returns a block with the tool name in the reason", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 3; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({}))).toBeUndefined();
    }
    const block = await observer.beforeToolCall(makeLoopCtx({}));
    expect(block).toEqual(expect.objectContaining({ block: true }));
    expect(block!.reason).toContain("ls");
    expect(toolResultEvents()).toHaveLength(1);
    expect(toolResultEvents()[0]!.payload.error).toContain("ls");
    expect(systemErrors()).toHaveLength(0);
    expect(agentInterrupts()).toHaveLength(0);
  });

  test("argument key order does not affect identity", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 3; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({ a: 1, b: 2 }))).toBeUndefined();
    }
    const block = await observer.beforeToolCall(makeLoopCtx({ b: 2, a: 1 }));
    expect(block).toEqual(expect.objectContaining({ block: true }));
  });

  test("different arguments or a different tool name reset the counter", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 3; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({ command: "ls" }, "bash"))).toBeUndefined();
    }
    expect(await observer.beforeToolCall(makeLoopCtx({ command: "pwd" }, "bash"))).toBeUndefined();
    for (let i = 0; i < 2; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({ command: "pwd" }, "bash"))).toBeUndefined();
    }
    const block = await observer.beforeToolCall(makeLoopCtx({ command: "pwd" }, "bash"));
    expect(block).toEqual(expect.objectContaining({ block: true }));
    expect(block!.reason).toContain("bash");
  });

  test("a new user message in context.messages resets the counter mid-sequence", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 3; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({}))).toBeUndefined();
    }
    const resetCtx = makeLoopCtx({}, "ls", [userMessage("continue", 2)]);
    expect(await observer.beforeToolCall(resetCtx)).toBeUndefined();
    for (let i = 0; i < 2; i += 1) {
      expect(await observer.beforeToolCall(resetCtx)).toBeUndefined();
    }
    const block = await observer.beforeToolCall(resetCtx);
    expect(block).toEqual(expect.objectContaining({ block: true }));
  });

  test("escalation: after a blocked fourth call, a fifth identical call publishes system.error and agent.interrupt", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 4; i += 1) {
      await observer.beforeToolCall(makeLoopCtx({}));
    }
    const block = await observer.beforeToolCall(makeLoopCtx({}));
    expect(block).toEqual(expect.objectContaining({ block: true, terminate: true }));
    expect(systemErrors()).toHaveLength(1);
    expect(systemErrors()[0]!.payload.error).toContain("ls");
    expect(agentInterrupts()).toHaveLength(1);
    expect(agentInterrupts()[0]!.payload).toEqual({ teamId: "t1", agentKey: "general-1" });
  });

  test("after a correction block, a different call resets escalation for the new identity", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 4; i += 1) {
      await observer.beforeToolCall(makeLoopCtx({}));
    }
    expect(await observer.beforeToolCall(makeLoopCtx({ path: "." }, "ls"))).toBeUndefined();
    for (let i = 0; i < 2; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({ path: "." }, "ls"))).toBeUndefined();
    }
    const block = await observer.beforeToolCall(makeLoopCtx({ path: "." }, "ls"));
    expect(block).toEqual(expect.objectContaining({ block: true }));
    expect(block!.reason).not.toContain("aborted");
    expect(block!.reason).toContain("ls");
  });

  test("a fresh identical run in a new user-ingress epoch starts from zero", async () => {
    const observer = makeObserver();
    for (let i = 0; i < 4; i += 1) {
      await observer.beforeToolCall(makeLoopCtx({}, "ls", [userMessage("first", 1)]));
    }
    const newEpochCtx = makeLoopCtx({}, "ls", [userMessage("second", 2)]);
    expect(await observer.beforeToolCall(newEpochCtx)).toBeUndefined();
    for (let i = 0; i < 2; i += 1) {
      expect(await observer.beforeToolCall(newEpochCtx)).toBeUndefined();
    }
    const block = await observer.beforeToolCall(newEpochCtx);
    expect(block).toEqual(expect.objectContaining({ block: true }));
    expect(block!.reason).not.toContain("aborted");
  });

  test("guard check runs before the PreToolUse hook and counts hook-blocked attempts", async () => {
    hookRunner.preToolUse.mockResolvedValue({ block: true, reason: "hook" });
    const observer = makeObserver();
    for (let i = 0; i < 3; i += 1) {
      expect(await observer.beforeToolCall(makeLoopCtx({}))).toEqual({ block: true, reason: "hook" });
    }
    const block = await observer.beforeToolCall(makeLoopCtx({}));
    expect(block!.reason).not.toBe("hook");
    expect(block!.reason).toContain("ls");
    expect(hookRunner.preToolUse).toHaveBeenCalledTimes(3);
  });
});
