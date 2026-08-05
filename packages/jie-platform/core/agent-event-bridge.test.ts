import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent, ToolResultMessage } from "@earendil-works/pi-ai";
import { AgentEventBridgeImpl, type AgentEventBridge } from "./agent-event-bridge";
import type { PromptQueue } from "./prompt-queue";
import type { AgentSender, EventEnvelope, EventManager, EventType } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { MemoryManager } from "../storage";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const promptQueue = vi.mocked<PromptQueue>({
  ingestUserPrompt: vi.fn(),
  ingestPeerNotification: vi.fn(),
  consumeResubmitted: vi.fn(),
  dequeue: vi.fn(),
  requeue: vi.fn(),
  dispatchNext: vi.fn(async () => {}),
  settle: vi.fn(async () => {}),
  drainForFollowUp: vi.fn(),
  takeTurnStartLabel: vi.fn(() => null),
  dropFollowUpLabel: vi.fn(),
  clearPendingLabel: vi.fn(),
  publishQueueUpdate: vi.fn(),
  isEmpty: vi.fn(() => true),
  stop: vi.fn(),
});

const persisted: AgentMessage[] = [];

const memory = vi.mocked<MemoryManager>({
  persist: vi.fn((message) => {
    persisted.push(message);
  }),
  compact: vi.fn(),
  restore: vi.fn(async () => []),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
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
  return new AgentEventBridgeImpl({ eventManager, memory, hookRunner, hookIdentity, sender, promptQueue, onRunEnd });
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
});

describe("AgentEventBridge — turn-start deferral", () => {
  test("turn_start defers agent.turn.start until the turn's next pi event", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    expect(envelopes("agent.turn.start")).toHaveLength(0);
    bridge.handleEvent({ type: "turn_end", message: makeAssistantMessage(), toolResults: [] });
    const turnStart = envelopes("agent.turn.start");
    expect(turnStart).toHaveLength(1);
    expect(turnStart[0]!.payload).toBeNull();
  });

  test("the flush consumes the queue's turn-start label", () => {
    promptQueue.takeTurnStartLabel.mockReturnValue("hello");
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "agent_end", messages: [] });
    expect(envelopes("agent.turn.start")[0]!.payload).toBe("hello");
  });

  test("message_start passes the user message to takeTurnStartLabel", () => {
    const bridge = makeBridge();
    const userMessage: AgentMessage = { role: "user", content: "hi", timestamp: 0 };
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: userMessage });
    expect(promptQueue.takeTurnStartLabel).toHaveBeenCalledWith(userMessage);
  });

  test("any other flushing event consumes the label with a null message", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "turn_end", message: makeAssistantMessage(), toolResults: [] });
    expect(promptQueue.takeTurnStartLabel).toHaveBeenCalledWith(null);
  });

  test("the deferred agent.turn.start precedes the turn's own stream events", () => {
    const bridge = makeBridge();
    bridge.handleEvent({ type: "turn_start" });
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    bridge.handleEvent({ type: "message_end", message: makeAssistantMessage() });
    const sequence = eventManager.publish.mock.calls.map((call) => call[0].topic);
    expect(sequence.filter((topic) => topic === "agent.turn.start" || topic === "agent.stream.end"))
      .toEqual(["agent.turn.start", "agent.stream.end"]);
  });

  test("3 turns alternate strictly: turn_start, idle, turn_start, idle, ...", () => {
    const bridge = makeBridge();
    for (let i = 0; i < 3; i++) {
      bridge.handleEvent({ type: "turn_start" });
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

  test("agent_end fires the Stop hook, clears the pending label, republishes the queue, and ends the run", () => {
    makeBridge().handleEvent({ type: "agent_end", messages: [] });
    expect(hookRunner.stop).toHaveBeenCalledWith({ identity: hookIdentity });
    expect(promptQueue.clearPendingLabel).toHaveBeenCalledTimes(1);
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

  test("message_start with a user message drops its follow-up label", () => {
    const bridge = makeBridge();
    const userMessage: AgentMessage = { role: "user", content: "hi", timestamp: 0 };
    bridge.handleEvent({ type: "message_start", message: userMessage });
    expect(promptQueue.dropFollowUpLabel).toHaveBeenCalledWith(userMessage);
    bridge.handleEvent({ type: "message_start", message: makeAssistantMessage() });
    expect(promptQueue.dropFollowUpLabel).toHaveBeenCalledTimes(1);
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
});

describe("AgentEventBridge — persistence", () => {
  test("message_end persists every message role via memory.persist", () => {
    const bridge = makeBridge();
    const cases: AgentMessage[] = [
      makeAssistantMessage({ content: [{ type: "text", text: "x" }] }),
      { role: "user", content: "hi", timestamp: 0 },
      makeToolResultMessage(),
    ];
    for (const message of cases) {
      bridge.handleEvent({ type: "message_end", message });
      expect(persisted).toHaveLength(1);
      expect(memory.persist).toHaveBeenCalledWith(message, "general-1", "s1", "t1");
      memory.persist.mockClear();
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

  test("message_end keeps diff and kanban details for the display consumers", () => {
    const bridge = makeBridge();
    const diffDetails = { kind: "diff", path: "a.txt", diff: "-x\n+y" };
    const kanbanDetails = { kind: "kanban", cards: [{ content: "task", status: "in_progress" }] };
    bridge.handleEvent({ type: "message_end", message: makeToolResultMessage(diffDetails) });
    bridge.handleEvent({ type: "message_end", message: makeToolResultMessage(kanbanDetails) });
    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({ details: diffDetails });
    expect(persisted[1]).toMatchObject({ details: kanbanDetails });
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
});
