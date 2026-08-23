import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent, ToolResultMessage } from "@earendil-works/pi-ai";
import { AgentEventBridgeImpl, type AgentEventBridge } from "./agent-event-bridge";
import type { PromptQueue } from "./prompt-queue";
import type { AgentSender, EventEnvelope, EventManager, EventType } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { SessionUsageStore, TranscriptStore } from "../storage";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const promptQueue = vi.mocked<PromptQueue>({
  ingestUserPrompt: vi.fn(),
  ingestPeerNotification: vi.fn(),
  ingestSystemPrompt: vi.fn(),
  consumeResubmitted: vi.fn(),
  dequeue: vi.fn(),
  requeue: vi.fn(),
  dispatchNext: vi.fn(async () => {}),
  settle: vi.fn(async () => {}),
  drainForFollowUp: vi.fn(),
  consumeChained: vi.fn(),
  publishQueueUpdate: vi.fn(),
  isEmpty: vi.fn(() => true),
  stop: vi.fn(),
});

const persisted: AgentMessage[] = [];

const sessionUsageStore = vi.mocked<SessionUsageStore>({
  load: vi.fn(() => null),
  accumulate: vi.fn(),
});

const transcriptStore = vi.mocked<TranscriptStore>({
  persist: vi.fn((message) => {
    persisted.push(message);
  }),
  compact: vi.fn(),
  restore: vi.fn(async () => []),
  restoreDisplay: vi.fn(async () => []),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
  listAgentKeys: vi.fn(() => []),
  remove: vi.fn(),
  sessionName: vi.fn(() => null),
  renameSession: vi.fn(),
});

const hookRunner = vi.mocked<HookRunner>({
  preToolUse: vi.fn(async () => ({ block: false, reason: null })),
  postToolUse: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
  userPromptSubmit: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
  sessionStart: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
});

const onRunEnd = vi.fn();

const hookIdentity: HookIdentity = { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" };
const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

function makeBridge(): AgentEventBridge {
  return new AgentEventBridgeImpl({ eventManager, transcriptStore, sessionUsageStore, hookRunner, hookIdentity, sender, promptQueue, onRunEnd });
}

function makeAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
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
    ...overrides,
  };
}

function makeToolResultMessage(details?: object): ToolResultMessage {
  const message: ToolResultMessage = {
    role: "toolResult",
    toolCallId: "call_x",
    toolName: "bash",
    content: [{ type: "text", text: "ok" }],
    isError: false,
    timestamp: 0,
  };
  if (details !== undefined) message.details = details;
  return message;
}

function envelopes<T extends EventType>(topic: T): EventEnvelope<T>[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<T> => env.topic === topic);
}

beforeEach(() => {
  persisted.length = 0;
  promptQueue.consumeChained.mockReturnValue(true);
});

const TRUNCATION_MESSAGE = "Response truncated: the model spent the entire maxTokens budget before producing output (stopReason: length). Consider raising maxTokens for this model.";

function systemErrors(): { error: string }[] {
  return envelopes("system.error").map((env) => env.payload);
}

describe("AgentEventBridge — budget truncation", () => {
  test("agent_end with stopReason length and empty content publishes a system.error truncation message and steers one continuation", () => {
    const bridge = makeBridge();
    bridge.handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(envelopes("agent.idle")).toHaveLength(1);
    expect(envelopes("agent.idle")[0]!.payload).toBe("length");
    expect(systemErrors()).toHaveLength(1);
    expect(systemErrors()[0]!).toEqual({ error: TRUNCATION_MESSAGE });
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
    expect(promptQueue.ingestSystemPrompt.mock.calls[0]![0]).toMatchObject({
      role: "user",
      content: expect.stringContaining("cut off"),
    });
  });

  test("thinking-only content is treated as truncated", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({
        stopReason: "length",
        content: [{ type: "thinking", thinking: "hmm" }],
      })],
    });
    expect(systemErrors()).toHaveLength(1);
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
  });

  test("length with a toolCall part is not published or steered (pi-agent-core already handles it)", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({
        stopReason: "length",
        content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: {} }],
      })],
    });
    expect(systemErrors()).toHaveLength(0);
    expect(promptQueue.ingestSystemPrompt).not.toHaveBeenCalled();
  });

  test("length with non-whitespace text is not published or steered", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({
        stopReason: "length",
        content: [{ type: "text", text: "partial answer" }],
      })],
    });
    expect(systemErrors()).toHaveLength(0);
    expect(promptQueue.ingestSystemPrompt).not.toHaveBeenCalled();
  });

  test("length with whitespace-only text is treated as truncated", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({
        stopReason: "length",
        content: [{ type: "text", text: "   \n\t  " }],
      })],
    });
    expect(systemErrors()).toHaveLength(1);
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
  });

  test("stop and toolUse empty messages are not published or steered", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "stop", content: [] })],
    });
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "toolUse", content: [] })],
    });
    expect(systemErrors()).toHaveLength(0);
    expect(promptQueue.ingestSystemPrompt).not.toHaveBeenCalled();
  });

  test("a second truncating agent_end in the same epoch publishes system.error but does not steer again", () => {
    const bridge = makeBridge();
    bridge.handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
    bridge.handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(systemErrors()).toHaveLength(2);
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
  });

  test("a user-ingress turn_start flush resets the cap so a later truncation steers again", () => {
    const bridge = makeBridge();
    bridge.handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(1);
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({
      type: "message_start",
      message: { role: "user", content: "hello", displayText: "hello", timestamp: 0 } as AgentMessage,
    });
    bridge.handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(promptQueue.ingestSystemPrompt).toHaveBeenCalledTimes(2);
  });

  test("system.error is published before onRunEnd so the queued steer is drained by continue()", () => {
    onRunEnd.mockImplementationOnce(() => {
      expect(systemErrors()).toHaveLength(1);
    });
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(onRunEnd).toHaveBeenCalled();
  });
});

describe("AgentEventBridge — turn-start deferral", () => {
  test("turn_start defers agent.turn.start until the user message_start", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    expect(envelopes("agent.turn.start")).toHaveLength(0);
    bridge.handleEvent({ type: "message_start", message: { role: "user", content: "hi", timestamp: 0 } });
    expect(envelopes("agent.turn.start")).toHaveLength(1);
  });

  test("the flush derives the turn-start payload from the user message's displayText", () => {
    const bridge = makeBridge();
    const userMessage = { role: "user", content: "hello", displayText: "hello", timestamp: 0 } as AgentMessage;
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: userMessage });
    expect(envelopes("agent.turn.start")[0]!.payload).toBe("hello");
  });

  test("a user message without displayText produces a null turn.start payload", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: { role: "user", content: "hi", timestamp: 0 } });
    expect(envelopes("agent.turn.start")[0]!.payload).toBeNull();
  });

  test("a non-user flushing event publishes agent.turn.continue", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    expect(envelopes("agent.turn.continue")).toHaveLength(1);
    expect(envelopes("agent.turn.start")).toHaveLength(0);
    expect(promptQueue.consumeChained).not.toHaveBeenCalled();
  });

  test("a user flushing event consumes the chained prompt and publishes agent.turn.start", () => {
    const bridge = makeBridge();
    const userMessage: AgentMessage = { role: "user", content: "hi", timestamp: 0 };
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: userMessage });
    expect(promptQueue.consumeChained).toHaveBeenCalledTimes(1);
    expect(promptQueue.consumeChained).toHaveBeenCalledWith(userMessage);
    expect(envelopes("agent.turn.start")).toHaveLength(1);
  });

  test("a turn with multiple chained user messages consumes each one and publishes a turn.start per message", () => {
    const bridge = makeBridge();
    const first = { role: "user", content: "first", displayText: "first", timestamp: 0 } as AgentMessage;
    const second = { role: "user", content: "second", displayText: "second", timestamp: 0 } as AgentMessage;
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: first });
    bridge.handleEvent({ type: "message_end", message: first });
    bridge.handleEvent({ type: "message_start", message: second });
    bridge.handleEvent({ type: "message_end", message: second });
    expect(promptQueue.consumeChained).toHaveBeenCalledTimes(2);
    expect(promptQueue.consumeChained).toHaveBeenCalledWith(first);
    expect(promptQueue.consumeChained).toHaveBeenCalledWith(second);
    const turnStarts = envelopes("agent.turn.start");
    expect(turnStarts).toHaveLength(2);
    expect(turnStarts[0]!.payload).toBe("first");
    expect(turnStarts[1]!.payload).toBe("second");
  });

  test("the deferred turn event precedes the turn's own stream events", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    const sequence = eventManager.publish.mock.calls.map((call) => call[0].topic);
    expect(sequence.filter((topic) => topic === "agent.turn.continue" || topic === "agent.stream.end"))
      .toEqual(["agent.turn.continue", "agent.stream.end"]);
  });

  test("3 turns alternate strictly: turn_start, idle, turn_start, idle, ...", () => {
    const bridge = makeBridge();
    const userMessage: AgentMessage = { role: "user", content: "hi", timestamp: 0 };
    for (let i = 0; i < 3; i++) {
      bridge.handleEvent({ type: "turn_start" });
      bridge.handleEvent({ type: "message_start", message: userMessage });
      bridge.handleEvent({ type: "agent_end", messages: [] });
    }
    const sequence = eventManager.publish.mock.calls.map((call) => call[0].topic);
    expect(sequence.filter((topic) => topic === "agent.turn.start" || topic === "agent.idle")).toEqual([
      "agent.turn.start",
      "agent.idle",
      "agent.turn.start",
      "agent.idle",
      "agent.turn.start",
      "agent.idle",
    ]);
  });
});

describe("AgentEventBridge — run lifecycle", () => {
  test("agent_end publishes agent.idle with the final stopReason", () => {
    makeBridge().handleEvent({ type: "agent_end", messages: [] });
    const idle = envelopes("agent.idle");
    expect(idle).toHaveLength(1);
    expect(idle[0]!.payload).toBe("stop");
  });

  test("agent_end with an errored final message publishes system.error", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "error", errorMessage: "boom" })],
    });
    expect(envelopes("agent.idle")[0]!.payload).toBe("error");
    const errors = envelopes("system.error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.payload).toEqual({ error: "boom" });
  });

  test("agent_end with an aborted final message does not publish system.error", () => {
    makeBridge().handleEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "aborted", errorMessage: "Request aborted" })],
    });
    expect(envelopes("agent.idle")[0]!.payload).toBe("aborted");
    expect(envelopes("system.error")).toHaveLength(0);
  });

  test("agent_end fires the Stop hook, republishes the queue, and ends the run", () => {
    makeBridge().handleEvent({ type: "agent_end", messages: [] });
    expect(hookRunner.stop).toHaveBeenCalledWith({ identity: hookIdentity });
    expect(promptQueue.publishQueueUpdate).toHaveBeenCalledTimes(1);
    expect(onRunEnd).toHaveBeenCalledTimes(1);
  });

  test("turn_end does NOT publish agent.idle; it drains the queue via the follow-up path (#89)", () => {
    makeBridge().handleEvent({ type: "turn_end", message: makeAssistantMessage(), toolResults: [] });
    expect(envelopes("agent.idle")).toHaveLength(0);
    expect(promptQueue.drainForFollowUp).toHaveBeenCalledWith(false);
  });

  test("turn_end on an errored turn drains with the error flag", () => {
    makeBridge().handleEvent({
      type: "turn_end",
      message: makeAssistantMessage({ stopReason: "aborted" }),
      toolResults: [],
    });
    expect(promptQueue.drainForFollowUp).toHaveBeenCalledWith(true);
  });
});

describe("AgentEventBridge — streaming", () => {
  test("message_start resets stream state: stream ids increment across streams", () => {
    const bridge = makeBridge();
    for (let i = 0; i < 2; i++) {
      bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
      bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    }
    expect(envelopes("agent.stream.end").map((env) => env.payload.stream_id)).toEqual([1, 2]);
  });

  test("message_update text_delta buffers text and flushes it on message_end", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    const update: AssistantMessageEvent = {
      type: "text_delta",
      contentIndex: 0,
      delta: "hello",
      partial: makeAssistantMessage(),
    };
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage(), assistantMessageEvent: update });
    expect(envelopes("agent.stream.chunk")).toHaveLength(0);
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    const chunks = envelopes("agent.stream.chunk");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({ stream_id: 1, seq: 0, block_type: "text", text: "hello" });
  });

  test("message_update thinking_delta publishes a chunk with block_type 'thinking'", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    const update: AssistantMessageEvent = {
      type: "thinking_delta",
      contentIndex: 0,
      delta: "hmm",
      partial: makeAssistantMessage(),
    };
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage(), assistantMessageEvent: update });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    expect(envelopes("agent.stream.chunk")[0]!.payload.block_type).toBe("thinking");
  });

  test("message_end (assistant) publishes agent.stream.end", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    const ends = envelopes("agent.stream.end");
    expect(ends).toHaveLength(1);
    expect(ends[0]!.payload).toMatchObject({ stream_id: 1, total_chunks: 0 });
  });

  test("message_end with non-assistant role publishes no agent.stream.end", () => {
    makeBridge().handleEvent({ type: "message_end", message: { role: "user", content: "hi", timestamp: 0 } });
    expect(envelopes("agent.stream.end")).toHaveLength(0);
  });
});

function seedBridge(bridge: AgentEventBridge, totals: { inputTokens: number; outputTokens: number }): void {
  (bridge as AgentEventBridgeImpl).seedSessionUsage(totals);
}

function usageEnvelope(): EventEnvelope<"agent.usage"> | undefined {
  const list = envelopes("agent.usage");
  return list[list.length - 1];
}

function lastAccumulated(): { inputTokens: number; outputTokens: number } | undefined {
  const call = sessionUsageStore.accumulate.mock.calls[sessionUsageStore.accumulate.mock.calls.length - 1];
  return call === undefined ? undefined : call[3];
}

describe("AgentEventBridge — usage", () => {
  test("message_end with a reported usage publishes agent.usage", () => {
    const usage = { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const bridge = makeBridge();
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage({ usage }) });
    const usages = envelopes("agent.usage");
    expect(usages).toHaveLength(1);
    expect(usages[0]!.payload).toMatchObject({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18 });
  });

  test("message_end with an all-zero usage publishes no agent.usage", () => {
    makeBridge().handleEvent({ type: "message_end", message: makeAssistantMessage() });
    expect(envelopes("agent.usage")).toHaveLength(0);
  });

  test("message_end accumulates the session usage and persists the delta", () => {
    const bridge = makeBridge();
    const usage = { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage({ usage }) });
    expect(sessionUsageStore.accumulate).toHaveBeenCalledWith("t1", "s1", "general-1", { inputTokens: 13, outputTokens: 5 });
  });

  test("seedSessionUsage offsets the cumulative session totals in the published event", () => {
    const bridge = makeBridge();
    seedBridge(bridge, { inputTokens: 100, outputTokens: 50 });
    const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage({ usage }) });
    expect(usageEnvelope()?.payload).toMatchObject({ session_input_tokens: 110, session_output_tokens: 55 });
  });

  test("message_start with usage publishes a partial agent.usage", () => {
    const bridge = makeBridge();
    seedBridge(bridge, { inputTokens: 5, outputTokens: 2 });
    const usage = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage }) });
    expect(usageEnvelope()?.payload).toMatchObject({ input: 1, output: 0, session_input_tokens: 5, session_output_tokens: 2, partial: true });
  });

  test("message_update with changed usage publishes an updated partial", () => {
    const bridge = makeBridge();
    seedBridge(bridge, { inputTokens: 5, outputTokens: 2 });
    const startUsage = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const updateUsage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage: startUsage }) });
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage({ usage: updateUsage }), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: makeAssistantMessage({ usage: updateUsage }) } });
    expect(envelopes("agent.usage")).toHaveLength(2);
    expect(envelopes("agent.usage")[1]!.payload).toMatchObject({ input: 1, output: 2, session_input_tokens: 5, session_output_tokens: 2, partial: true });
  });

  test("message_update with unchanged usage does not publish a duplicate partial", () => {
    const bridge = makeBridge();
    const usage = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage }) });
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage({ usage }), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: makeAssistantMessage({ usage }) } });
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage({ usage }), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " there", partial: makeAssistantMessage({ usage }) } });
    expect(envelopes("agent.usage")).toHaveLength(1);
  });

  test("partial-then-final does not double count", () => {
    const bridge = makeBridge();
    const startUsage = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const updateUsage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage: startUsage }) });
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage({ usage: updateUsage }), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: makeAssistantMessage({ usage: updateUsage }) } });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage({ usage: updateUsage }) });
    expect(sessionUsageStore.accumulate).toHaveBeenCalledTimes(1);
    expect(lastAccumulated()).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(usageEnvelope()?.payload).toMatchObject({ session_input_tokens: 1, session_output_tokens: 2, partial: false });
  });

  test("message_end without usage falls back to the tracked partial", () => {
    const bridge = makeBridge();
    const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage }) });
    bridge.handleEvent({ type: "message_update", message: makeAssistantMessage({ usage }), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: makeAssistantMessage({ usage }) } });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    expect(sessionUsageStore.accumulate).toHaveBeenCalledWith("t1", "s1", "general-1", { inputTokens: 1, outputTokens: 2 });
    expect(usageEnvelope()?.payload).toMatchObject({ input: 1, output: 2, totalTokens: 3, partial: false });
  });

  test("all-zero usage publishes nothing and clears partial state", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    expect(envelopes("agent.usage")).toHaveLength(0);
  });

  test("agent_end clears partial state so a stale partial cannot leak", () => {
    const bridge = makeBridge();
    const usage = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ usage }) });
    bridge.handleEvent({ type: "agent_end", messages: [] });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    expect(sessionUsageStore.accumulate).not.toHaveBeenCalled();
  });
});

describe("AgentEventBridge — persistence", () => {
  test("message_end persists every message role via transcriptStore.persist", () => {
    const bridge = makeBridge();
    const cases: AgentMessage[] = [
      makeAssistantMessage({ content: [{ type: "text", text: "x" }] }),
      { role: "user", content: "hi", timestamp: 0 },
      makeToolResultMessage(),
      { role: "custom", customType: "test", content: "x", display: false, timestamp: 0 },
    ];
    for (const message of cases) {
      bridge.handleEvent({ type: "message_end", message });
      expect(persisted).toHaveLength(1);
      expect(transcriptStore.persist).toHaveBeenCalledWith(message, "general-1", "s1", "t1");
      transcriptStore.persist.mockClear();
      persisted.length = 0;
    }
  });

  test("message_end strips toolResult details that no display consumer reads", () => {
    makeBridge().handleEvent({ type: "message_end", message: makeToolResultMessage({ kind: "bash", exitCode: 0 }) });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty("details");
    expect(persisted[0]).toMatchObject({ role: "toolResult", toolCallId: "call_x", toolName: "bash", isError: false });
  });

  test("message_end strips toolResult details without a kind discriminator", () => {
    makeBridge().handleEvent({ type: "message_end", message: makeToolResultMessage({ exitCode: 0 }) });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty("details");
  });

  test("message_end keeps diff details for history rendering", () => {
    const diffDetails = { kind: "diff", path: "a.txt", diff: "-x\n+y" };
    makeBridge().handleEvent({ type: "message_end", message: makeToolResultMessage(diffDetails) });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ details: diffDetails });
  });

  test("message_end strips kanban details; the board hydrates from the store instead", () => {
    const kanbanDetails = { kind: "kanban", cards: [{ content: "task", status: "in_progress" }] };
    makeBridge().handleEvent({ type: "message_end", message: makeToolResultMessage(kanbanDetails) });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty("details");
  });

  test("message_end persists a toolResult without details unchanged", () => {
    makeBridge().handleEvent({ type: "message_end", message: makeToolResultMessage() });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ role: "toolResult", toolCallId: "call_x" });
    expect(persisted[0]).not.toHaveProperty("details");
  });

  test("message_end stripping does not mutate the live message", () => {
    const message = makeToolResultMessage({ kind: "bash", exitCode: 0 });
    makeBridge().handleEvent({ type: "message_end", message });
    expect(message.details).toEqual({ kind: "bash", exitCode: 0 });
  });

  test("message_end stamps thinkingDurationMs onto assistant thinking content from the stream", () => {
    vi.useFakeTimers({ now: 0 });
    try {
      persisted.length = 0;
      const bridge = makeBridge();
      bridge.handleEvent({ type: "message_start", message: makeAssistantMessage({ content: [] }) });
      bridge.handleEvent({ type: "message_update", message: makeAssistantMessage(), assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "hmm", partial: makeAssistantMessage() } });
      vi.advanceTimersByTime(250);
      bridge.handleEvent({ type: "message_end", message: makeAssistantMessage({ content: [{ type: "thinking", thinking: "hmm" }] }) });
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toEqual(makeAssistantMessage({ content: [{ type: "thinking", thinking: "hmm", thinkingDurationMs: 250 }] }));
    } finally {
      vi.useRealTimers();
    }
  });
});
