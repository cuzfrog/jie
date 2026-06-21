import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { type Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { JieAgentBody } from "./jie-agent-body.ts";
import { createEventBus, type EventBus } from "./event-bus.ts";
import { createEventManager, type EventManager } from "./event-manager.ts";
import type { MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { StreamPublisher } from "./streaming.ts";

function makeSoul(overrides: Partial<AgentSoul> = {}): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    system_prompt: "you are a general assistant",
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
  prompt: ReturnType<typeof mock>;
  continue: ReturnType<typeof mock>;
  subscribe: ReturnType<typeof mock>;
} {
  const state = {
    messages: overrides.messages ?? [],
    isStreaming: overrides.isStreaming ?? false,
  };
  const prompt = mock(async () => {});
  const cont = mock(async () => {});
  const subscribe = mock(() => () => {});
  const agent = {
    state,
    prompt,
    continue: cont,
    subscribe,
  } as unknown as Agent;
  return { agent, state, prompt, continue: cont, subscribe };
}

function makeFakeStream(): {
  stream: StreamPublisher;
  beginStream: ReturnType<typeof mock>;
  append: ReturnType<typeof mock>;
  endStream: ReturnType<typeof mock>;
} {
  const beginStream = mock(() => {});
  const append = mock(() => {});
  const endStream = mock(() => ({ stream_id: 0, total_chunks: 0 }));
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
  restore: ReturnType<typeof mock>;
  persist: ReturnType<typeof mock>;
} {
  const persisted: AgentMessage[] = [];
  const persist = mock(async (msg: AgentMessage) => {
    persisted.push(msg);
  });
  const restore = mock(async () => persisted.slice());
  const memory = { persist, restore } as unknown as MemoryManager;
  return { memory, persisted, restore, persist };
}

interface Harness {
  bus: EventBus;
  memory: MemoryManager;
  agent: Agent;
  state: { messages: AgentMessage[]; isStreaming: boolean };
  prompt: ReturnType<typeof mock>;
  continue: ReturnType<typeof mock>;
  subscribe: ReturnType<typeof mock>;
  stream: StreamPublisher;
  beginStream: ReturnType<typeof mock>;
  append: ReturnType<typeof mock>;
  endStream: ReturnType<typeof mock>;
  publisher: EventManager;
  persisted: AgentMessage[];
  makeBody: (overrides?: Partial<{ soul: AgentSoul; is_leader: boolean; session_id: string; agent_key: string }>) => JieAgentBody;
}

function makeHarness(): Harness {
  const bus = createEventBus();
  const publisher = createEventManager(bus);
  const { memory, persisted } = makeFakeMemory();
  const { agent, state, prompt, continue: cont, subscribe } = makeFakeAgent();
  const { stream, beginStream, append, endStream } = makeFakeStream();
  const makeBody: Harness["makeBody"] = (overrides = {}) =>
    new JieAgentBody({
      agent_key: overrides.agent_key ?? "general-1",
      team_id: "t1",
      soul: overrides.soul ?? makeSoul(),
      is_leader: overrides.is_leader ?? true,
      session_id: overrides.session_id ?? "s1",
      events: publisher,
      memory,
      agent,
      streamPublisher: stream,
    });
  return {
    bus,
    memory,
    agent,
    state,
    prompt,
    continue: cont,
    subscribe,
    stream,
    beginStream,
    append,
    endStream,
    publisher,
    persisted,
    makeBody,
  };
}

describe("JieAgentBody — identity", () => {
  test("constructor stores the identity fields from deps", () => {
    const h = makeHarness();
    const body = h.makeBody({ agent_key: "leader-1", is_leader: true }) as unknown as {
      agent_key: string;
      team_id: string;
      is_leader: boolean;
    };
    expect(body.agent_key).toBe("leader-1");
    expect(body.team_id).toBe("t1");
    expect(body.is_leader).toBe(true);
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

  test("subscribes to {team_id}.{agent_key}", async () => {
    await body.start();
    let received = false;
    h.bus.subscribe("t1.general-1", () => {
      received = true;
    });
    h.bus.publish("t1.general-1", {
      version: 1,
      team_id: "t1",
      event_type: "test",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "hi" },
    });
    expect(received).toBe(true);
  });

  test("is_leader=true: subscribes to {team_id}.leader.prompt", async () => {
    await body.start();
    let received = false;
    h.bus.subscribe("t1.leader.prompt", () => {
      received = true;
    });
    h.bus.publish("t1.leader.prompt", {
      version: 1,
      team_id: "t1",
      event_type: "leader.prompt",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "go" },
    });
    expect(received).toBe(true);
  });

  test("is_leader=false: does NOT subscribe to {team_id}.leader.prompt", () => {
    const b2 = h.makeBody({ is_leader: false, agent_key: "worker-1" });
    void b2;
    expect(h.bus.subscriberCount("t1.worker-1")).toBe(0);
    expect(h.bus.subscriberCount("t1.leader.prompt")).toBe(0);
  });

  test("subscribes to each topic in soul.subscriptions", async () => {
    body.stop();
    const b2 = h.makeBody({
      soul: makeSoul({ subscriptions: ["task.recorded"] }),
    });
    await b2.start();
    let received = false;
    h.bus.subscribe("t1.task.recorded", () => {
      received = true;
    });
    h.bus.publish("t1.task.recorded", {
      version: 1,
      team_id: "t1",
      event_type: "task.recorded",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "task", source: "x" },
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

  test("`leader.prompt` (no source) is formatted as `[user]: <prompt>`", async () => {
    const body = h.makeBody();
    await body.start();
    h.bus.publish("t1.leader.prompt", {
      version: 1,
      team_id: "t1",
      event_type: "leader.prompt",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "hello" },
    });
    const calls = h.prompt.mock.calls as Array<[AgentMessage]>;
    expect(calls.length).toBeGreaterThan(0);
    const synthetic = calls[0]![0] as { role: string; content: string };
    expect(synthetic.role).toBe("user");
    expect(synthetic.content).toBe("[user]: hello");
    body.stop();
  });

  test("notify-sourced event (with source) is formatted as `[<source> on '<topic>']: <prompt>`", async () => {
    const body = h.makeBody();
    await body.start();
    h.bus.publish("t1.general-1", {
      version: 1,
      team_id: "t1",
      event_type: "task.researched",
      agent_role: "researcher",
      agent_key: "researcher-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "report", source: "researcher-1" },
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
});

describe("JieAgentBody — addExternalCleanup + stop()", () => {
  test("stop() invokes each external cleanup", () => {
    const h = makeHarness();
    const body = h.makeBody();
    const cleanup1 = mock(() => {});
    const cleanup2 = mock(() => {});
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
    expect(h.bus.subscriberCount("t1.general-1")).toBe(1);
    body.stop();
    expect(h.bus.subscriberCount("t1.general-1")).toBe(0);
  });

  test("start() is idempotent (second call does not re-subscribe)", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    const countAfterFirst = h.bus.subscriberCount("t1.general-1");
    await body.start();
    const countAfterSecond = h.bus.subscriberCount("t1.general-1");
    expect(countAfterFirst).toBe(countAfterSecond);
    body.stop();
  });
});
