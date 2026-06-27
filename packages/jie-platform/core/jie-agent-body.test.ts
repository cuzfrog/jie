import { type Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { JieAgentBody } from "./jie-agent-body";
import { createEventManager, type EventManager } from "../event";
import type { MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { StreamPublisher } from "./streaming";

function makeSoul(overrides: Partial<AgentSoul> = {}): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    systemPrompt: "you are a general assistant",
    tools: [],
    subscribe: [],
    subscriptions: [],
    ...overrides,
  };
}

function makeFakeAgent(overrides: Partial<{
  messages: AgentMessage[];
  isStreaming: boolean;
}> = {}): {
  agent: Agent;
  state: { messages: AgentMessage[]; isStreaming: boolean };
  prompt: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
  steer: ReturnType<typeof vi.fn>;
  continue: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
} {
  const state = {
    messages: overrides.messages ?? [],
    isStreaming: overrides.isStreaming ?? false,
  };
  const prompt = vi.fn(async () => {});
  const followUp = vi.fn(() => {});
  const steer = vi.fn(() => {});
  const cont = vi.fn(async () => {});
  const subscribe = vi.fn(() => () => {});
  const agent = {
    state,
    prompt,
    followUp,
    steer,
    continue: cont,
    subscribe,
  } as unknown as Agent;
  return { agent, state, prompt, followUp, steer, continue: cont, subscribe };
}

function makeFakeStream(): {
  stream: StreamPublisher;
  beginStream: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  endStream: ReturnType<typeof vi.fn>;
} {
  const beginStream = vi.fn(() => {});
  const append = vi.fn(() => {});
  const endStream = vi.fn(() => ({ stream_id: 0, total_chunks: 0 }));
  const stream = {
    beginStream,
    append,
    endStream,
  } as unknown as StreamPublisher;
  return { stream, beginStream, append, endStream };
}

function makeFakeMemory(): {
  memory: MemoryManager;
  persisted: AgentMessage[];
  restore: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
} {
  const persisted: AgentMessage[] = [];
  const persist = vi.fn(async (msg: AgentMessage) => {
    persisted.push(msg);
  });
  const restore = vi.fn(async () => persisted.slice());
  const memory = { persist, restore } as unknown as MemoryManager;
  return { memory, persisted, restore, persist };
}

interface Harness {
  events: EventManager;
  memory: MemoryManager;
  agent: Agent;
  state: { messages: AgentMessage[]; isStreaming: boolean };
  prompt: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
  steer: ReturnType<typeof vi.fn>;
  continue: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  stream: StreamPublisher;
  beginStream: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  endStream: ReturnType<typeof vi.fn>;
  persisted: AgentMessage[];
  makeBody: (overrides?: Partial<{ soul: AgentSoul; isLeader: boolean; sessionId: string; agentKey: string }>) => JieAgentBody;
}

function makeHarness(): Harness {
  const events: EventManager = createEventManager();
  const { memory, persisted } = makeFakeMemory();
  const { agent, state, prompt, followUp, steer, continue: cont, subscribe } = makeFakeAgent();
  const { stream, beginStream, append, endStream } = makeFakeStream();
  const makeBody: Harness["makeBody"] = (overrides = {}) =>
    new JieAgentBody({
      agentKey: overrides.agentKey ?? "general-1",
      teamId: "t1",
      soul: overrides.soul ?? makeSoul(),
      isLeader: overrides.isLeader ?? true,
      sessionId: overrides.sessionId ?? "s1",
      eventManager: events,
      memory,
      agent,
      streamPublisher: stream,
    });
  return {
    events,
    memory,
    agent,
    state,
    prompt,
    followUp,
    steer,
    continue: cont,
    subscribe,
    stream,
    beginStream,
    append,
    endStream,
    persisted,
    makeBody,
  };
}

describe("JieAgentBody — identity", () => {
  test("constructor stores the identity fields from deps", () => {
    const h = makeHarness();
    const body = h.makeBody({ agentKey: "leader-1", isLeader: true }) as unknown as {
      agentKey: string;
      teamId: string;
    };
    expect(body.agentKey).toBe("leader-1");
    expect(body.teamId).toBe("t1");
  });
});

describe("JieAgentBody — start() subscriptions", () => {
  let h: Harness;
  let body: JieAgentBody;

  beforeEach(() => {
    h = makeHarness();
    body = h.makeBody();
  });

  afterEach(() => {
    body.stop();
  });

  test("subscribes to team.{teamId}.agent.{agentKey}.prompt", async () => {
    await body.start();
    let received = false;
    h.events.subscribe("team.t1.agent.general-1.prompt", () => {
      received = true;
    });
    h.events.publish({
      version: 1,
      topic: "team.t1.agent.general-1.prompt",
      sender: { kind: "cli" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "t1", agentKey: "general-1", prompt: "hi" },
    });
    expect(received).toBe(true);
  });

  test("isLeader=true: subscribes to own agent prompt subject", async () => {
    await body.start();
    let received = false;
    h.events.subscribe("team.t1.agent.general-1.prompt", () => {
      received = true;
    });
    h.events.publish({
      version: 1,
      topic: "team.t1.agent.general-1.prompt",
      sender: { kind: "cli" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "t1", agentKey: "general-1", prompt: "go" },
    });
    expect(received).toBe(true);
  });

  test("isLeader=false: subscribes to own agent prompt subject (not leader's)", async () => {
    const b2 = h.makeBody({ isLeader: false, agentKey: "worker-1" });
    await b2.start();
    expect(h.events.subscriberCount("team.t1.agent.worker-1.prompt")).toBe(1);
    b2.stop();
  });

  test("subscribes to each topic in soul.subscriptions", async () => {
    body.stop();
    const b2 = h.makeBody({
      soul: makeSoul({ subscriptions: ["task.recorded"] }),
    });
    await b2.start();
    let received = false;
    h.events.subscribe("custom.t1.task.recorded", () => {
      received = true;
    });
    h.events.publish({
      version: 1,
      topic: "custom.t1.task.recorded",
      sender: { kind: "agent", identity: { teamId: "t1", agentRole: "general", agentKey: "general-1" } },
      timestamp: new Date().toISOString(),
      payload: { clientTopic: "t1.task.recorded", payload: { prompt: "task", source: "x" } },
    });
    expect(received).toBe(true);
    b2.stop();
  });
});

describe("JieAgentBody — start() restore + continue", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("fresh session (no rows): no continue call", async () => {
    const body = h.makeBody();
    await body.start();
    expect(h.continue).not.toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `user`: agent.continue is called", async () => {
    h.persisted.push(
      { role: "user", content: "hi" } as unknown as AgentMessage,
      { role: "assistant", content: "hello" } as unknown as AgentMessage,
      { role: "user", content: "next" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `toolResult`: agent.continue is called", async () => {
    h.persisted.push(
      { role: "user", content: "x" } as unknown as AgentMessage,
      { role: "toolResult", content: "y" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `assistant`: continue NOT called", async () => {
    h.persisted.push(
      { role: "user", content: "hi" } as unknown as AgentMessage,
      { role: "assistant", content: "hello" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).not.toHaveBeenCalled();
    body.stop();
  });

  test("restored messages are pushed into agent.state.messages", async () => {
    h.persisted.push(
      { role: "user", content: "m1" } as unknown as AgentMessage,
      { role: "assistant", content: "m2" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.state.messages).toHaveLength(2);
    body.stop();
  });
});

describe("JieAgentBody — prompt ingress format", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("`agent.prompt` (no source) is formatted as `[user]: <prompt>`", async () => {
    const body = h.makeBody();
    await body.start();
    h.events.publish({
      version: 1,
      topic: "team.t1.agent.general-1.prompt",
      sender: { kind: "cli" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "t1", agentKey: "general-1", prompt: "hello" },
    });
    const calls = h.prompt.mock.calls as Array<[AgentMessage]>;
    expect(calls.length).toBeGreaterThan(0);
    const synthetic = calls[0]![0] as { role: string; content: string };
    expect(synthetic.role).toBe("user");
    expect(synthetic.content).toBe("[user]: hello");
    body.stop();
  });

  test("notify-sourced event (with source) is formatted as `[<source> on '<topic>']: <prompt>`", async () => {
    const body = h.makeBody({
      soul: makeSoul({ subscriptions: ["task.researched"] }),
    });
    await body.start();
    h.events.publish({
      version: 1,
      topic: "custom.t1.task.researched",
      sender: { kind: "agent", identity: { teamId: "t1", agentRole: "researcher", agentKey: "researcher-1" } },
      timestamp: new Date().toISOString(),
      payload: { clientTopic: "t1.task.researched", payload: { prompt: "report", source: "researcher-1" } },
    });
    const calls = h.prompt.mock.calls as Array<[AgentMessage]>;
    const synthetic = calls[0]![0] as { content: string };
    expect(synthetic.content).toBe(
      "[researcher-1 on 'task.researched']: report",
    );
    body.stop();
  });
});

describe("JieAgentBody — handlePiAgentEvent (stream bridge)", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("message_start: stream.beginStream is called", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_start",
      message: { role: "assistant", content: [] } as unknown as AgentMessage,
    });
    expect(h.beginStream).toHaveBeenCalled();
  });

  test("message_update text_delta: stream.append('text', delta)", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_update",
      message: { role: "assistant", content: [] } as never,
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "hello",
        partial: { role: "assistant", content: [] } as never,
      },
    });
    expect(h.append).toHaveBeenCalledWith("text", "hello");
  });

  test("message_update thinking_delta: stream.append('thinking', delta)", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_update",
      message: { role: "assistant", content: [] } as never,
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
        partial: { role: "assistant", content: [] } as never,
      },
    });
    expect(h.append).toHaveBeenCalledWith("thinking", "hmm");
  });

  test("message_end: stream.endStream is called", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: { role: "assistant", content: [] } as unknown as AgentMessage,
    });
    expect(h.endStream).toHaveBeenCalled();
  });

  test("message_end with assistant: memory.persist is called", async () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "x" }],
      } as unknown as AgentMessage,
    });
    await Promise.resolve();
    expect(h.persisted.length).toBe(1);
  });

  test("message_end with custom role: memory.persist is called (no role check)", async () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: {
        role: "custom",
        customType: "test",
        content: "x",
        display: false,
        timestamp: Date.now(),
      } as unknown as AgentMessage,
    });
    await Promise.resolve();
    expect(h.persisted.length).toBe(1);
  });

  test("message_end with user role: memory.persist is called (#49)", async () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: {
        role: "user",
        content: "hi",
      } as unknown as AgentMessage,
    });
    await Promise.resolve();
    expect(h.persisted.length).toBe(1);
  });

  test("message_end with toolResult role: memory.persist is called (#49)", async () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "call_x",
        content: "ok",
        isError: false,
        timestamp: Date.now(),
      } as unknown as AgentMessage,
    });
    await Promise.resolve();
    expect(h.persisted.length).toBe(1);
  });

  test("message_end with assistant: stream.endStream is called (#51)", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: { role: "assistant", content: [] } as unknown as AgentMessage,
    });
    expect(h.endStream).toHaveBeenCalled();
  });

  test("message_end with non-assistant role: stream.endStream is NOT called (#51)", () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({
      type: "message_end",
      message: {
        role: "user",
        content: "hi",
      } as unknown as AgentMessage,
    });
    expect(h.endStream).not.toHaveBeenCalled();
  });

  test("agent_end drains the queue: dequeued message is passed to agent.followUp (not prompt, to avoid activeRun throw)", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish({
      topic: "team.t1.agent.general-1.prompt",
      payload: { prompt: "queued msg" },
      sender: { kind: "cli" },
      version: 1,
      timestamp: new Date().toISOString(),
    });
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
    h.state.isStreaming = false;
    body.handlePiAgentEvent({ type: "agent_end", messages: [] });
    expect(h.followUp.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls.length).toBe(0);
  });

  test("agent_end with no queued message: agent.followUp not called", async () => {
    const body = h.makeBody();
    body.handlePiAgentEvent({ type: "agent_end", messages: [] });
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
  });
});

describe("JieAgentBody — addExternalCleanup + stop()", () => {
  test("stop() invokes each external cleanup", () => {
    const h = makeHarness();
    const body = h.makeBody();
    const cleanup1 = vi.fn(() => {});
    const cleanup2 = vi.fn(() => {});
    body.addExternalCleanup(cleanup1);
    body.addExternalCleanup(cleanup2);
    body.stop();
    expect(cleanup1).toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalled();
  });

  test("stop() unsubscribes bus subscriptions registered via start()", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    expect(h.events.subscriberCount("team.t1.agent.general-1.prompt")).toBe(1);
    body.stop();
    expect(h.events.subscriberCount("team.t1.agent.general-1.prompt")).toBe(0);
  });

  test("start() is idempotent (second call does not re-subscribe)", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    const countAfterFirst = h.events.subscriberCount("team.t1.agent.general-1.prompt");
    await body.start();
    const countAfterSecond = h.events.subscriberCount("team.t1.agent.general-1.prompt");
    expect(countAfterFirst).toBe(countAfterSecond);
    body.stop();
  });
});
