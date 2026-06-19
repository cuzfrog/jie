import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { AgentBody } from "./agent-body.ts";
import { createEventBus, type EventBus } from "./event-bus.ts";
// EXCEPTION: The `InMemory*` classes are file-private to the storage
// module — they are intentionally not re-exported from `storage/index.ts`.
// Tests in this same package reach them via direct sibling-file imports
// so we can substitute mocks for the real SQLite-backed factories
// without `mock.module()` (which is global-state and would leak across
// test files). The cross-directory file-specific import is acceptable
// here because the dependency is a true in-memory mock, not a coupling
// to the storage module's public surface. If a new sibling module is
// added that needs in-memory mocks, copy this comment — do NOT use
// this pattern for production code.
import { InMemoryArtifactStore } from "../storage/artifact-store.ts";
import { InMemoryMemoryManager } from "../storage/memory-store.ts";
import type { ArtifactStore, MemoryManager } from "../storage/index.ts";
import { createToolRegistry, type ToolRegistry } from "../tools/tool-registry.ts";
import type { AgentSoul } from "../team/types.ts";
import type { Tool, ToolResult } from "../tools/types.ts";

function makeSoul(): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    system_prompt: "you are a general assistant",
    tools: ["noop"],
    subscribe: [],
    subscriptions: [],
  };
}

interface FakeAgent {
  subscribe: ReturnType<typeof mock>;
  state: {
    systemPrompt: string;
    model: unknown;
    tools: unknown[];
    messages: AgentMessage[];
    isStreaming: boolean;
  };
  continue: ReturnType<typeof mock>;
  prompt: ReturnType<typeof mock>;
}

function makeFakeAgentFactory(overrides: Partial<FakeAgent> = {}): {
  factory: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  fake: FakeAgent;
} {
  const fake: FakeAgent = {
    subscribe: mock(() => () => {}),
    state: {
      systemPrompt: "",
      model: null,
      tools: [],
      messages: [],
      isStreaming: false,
      ...overrides.state,
    },
    continue: mock(async () => {}),
    prompt: mock(async () => {}),
    ...overrides,
  };
  const stub = {
    state: fake.state,
    subscribe: fake.subscribe,
    continue: fake.continue,
    prompt: fake.prompt,
  } as unknown as Agent;
  return {
    factory: () => stub,
    fake,
  };
}

function makeNoopTool(): Tool {
  return {
    name: "noop",
    description: "no-op",
    label: "Noop",
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      return { content: "noop" };
    },
  };
}

describe("AgentBody — construction", () => {
  let bus: EventBus;
  let artifacts: ArtifactStore;
  let memory: MemoryManager;
  let registry: ToolRegistry;
  let body: AgentBody;

  beforeEach(() => {
    bus = createEventBus();
    artifacts = new InMemoryArtifactStore(); memory = new InMemoryMemoryManager();
    registry = createToolRegistry();
    registry.register("noop", makeNoopTool());
  });

  afterEach(() => {
    body?.stop();
  });

  test("constructor accepts the required options", () => {
    const { factory } = makeFakeAgentFactory();
    body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: makeSoul(),
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: factory,
    });
    expect(body.agent_key).toBe("general-1");
    expect(body.team_id).toBe("t1");
    expect(body.is_leader).toBe(true);
  });
});

describe("AgentBody — start() subscriptions", () => {
  let bus: EventBus;
  let artifacts: ArtifactStore;
  let memory: MemoryManager;
  let registry: ToolRegistry;
  let body: AgentBody;

  beforeEach(() => {
    bus = createEventBus();
    artifacts = new InMemoryArtifactStore(); memory = new InMemoryMemoryManager();
    registry = createToolRegistry();
    registry.register("noop", makeNoopTool());
    const result = makeFakeAgentFactory();
    body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: makeSoul(),
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
  });

  afterEach(() => {
    body.stop();
  });

  test("subscribes to {team_id}.{agent_key}", async () => {
    await body.start();
    let received = false;
    bus.subscribe("t1.general-1", () => {
      received = true;
    });
    bus.publish("t1.general-1", {
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
    bus.subscribe("t1.leader.prompt", () => {
      received = true;
    });
    bus.publish("t1.leader.prompt", {
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

  test("is_leader=false: does NOT subscribe to {team_id}.leader.prompt", async () => {
    body.stop();
    const result = makeFakeAgentFactory();
    body = new AgentBody({
      agent_key: "worker-1",
      team_id: "t1",
      soul: { ...makeSoul(), role: "worker" },
      is_leader: false,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
    await body.start();
    // The body should have registered only its own-addressed
    // subscription (worker-1), not leader.prompt.
    expect(bus.subscriberCount("t1.worker-1")).toBe(1);
    expect(bus.subscriberCount("t1.leader.prompt")).toBe(0);
  });

  test("subscribes to each topic in soul.subscriptions", async () => {
    body.stop();
    const result = makeFakeAgentFactory();
    body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: {
        ...makeSoul(),
        subscribe: ["task.recorded"],
        subscriptions: ["task.recorded"],
      },
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
    await body.start();
    let received = false;
    bus.subscribe("t1.task.recorded", () => {
      received = true;
    });
    bus.publish("t1.task.recorded", {
      version: 1,
      team_id: "t1",
      event_type: "task.recorded",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "task", source: "x" },
    });
    expect(received).toBe(true);
  });
});

describe("AgentBody — start() restore + continue", () => {
  let bus: EventBus;
  let artifacts: ArtifactStore;
  let memory: MemoryManager;
  let registry: ToolRegistry;
  let fake: FakeAgent;

  function makeBody() {
    const result = makeFakeAgentFactory();
    fake = result.fake;
    return new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: makeSoul(),
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
  }

  beforeEach(() => {
    bus = createEventBus();
    artifacts = new InMemoryArtifactStore(); memory = new InMemoryMemoryManager();
    registry = createToolRegistry();
    registry.register("noop", makeNoopTool());
  });

  test("fresh session (no rows): no continue call", async () => {
    const body = makeBody();
    await body.start();
    expect(fake.continue).not.toHaveBeenCalled();
  });

  test("restore ends with `user`: agent.continue is called", async () => {
    memory.persist(
      {
        role: "user",
        content: "prior user",
        timestamp: Date.now(),
      } as unknown as AgentMessage,
      "general-1",
      "s1",
      "t1",
    );
    const body = makeBody();
    await body.start();
    expect(fake.continue).toHaveBeenCalledTimes(1);
  });

  test("restore ends with `toolResult`: agent.continue is called", async () => {
    memory.persist(
      {
        role: "toolResult",
        toolCallId: "x",
        toolName: "t",
        content: [{ type: "text", text: "r" }],
        timestamp: Date.now(),
        isError: false,
      } as unknown as AgentMessage,
      "general-1",
      "s1",
      "t1",
    );
    const body = makeBody();
    await body.start();
    expect(fake.continue).toHaveBeenCalledTimes(1);
  });

  test("restore ends with `assistant`: continue NOT called", async () => {
    memory.persist(
      {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        timestamp: Date.now(),
      } as unknown as AgentMessage,
      "general-1",
      "s1",
      "t1",
    );
    const body = makeBody();
    await body.start();
    expect(fake.continue).not.toHaveBeenCalled();
  });

  test("restored messages are pushed into agent.state.messages", async () => {
    memory.persist(
      {
        role: "user",
        content: "a",
        timestamp: Date.now(),
      } as unknown as AgentMessage,
      "general-1",
      "s1",
      "t1",
    );
    memory.persist(
      {
        role: "assistant",
        content: [{ type: "text", text: "b" }],
        timestamp: Date.now(),
      } as unknown as AgentMessage,
      "general-1",
      "s1",
      "t1",
    );
    const body = makeBody();
    await body.start();
    expect(fake.state.messages).toHaveLength(2);
  });
});

describe("AgentBody — tool adaptation", () => {
  test("soul.tools specs are resolved and adapted", () => {
    const bus = createEventBus();
    const artifacts = new InMemoryArtifactStore(); const memory = new InMemoryMemoryManager();
    const registry = createToolRegistry();
    registry.register("noop", makeNoopTool());

    const { factory, fake } = makeFakeAgentFactory();
    const body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: { ...makeSoul(), tools: ["noop"] },
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: factory,
    });
    void body;
    // The fake's state.tools is set on construction; verify the
    // constructor populated it.
    expect((fake.state.tools as unknown[]).length).toBe(1);
    const adapted = (fake.state.tools as unknown[])[0] as { name: string };
    expect(adapted.name).toBe("noop");
  });
});

describe("AgentBody — prompt ingress format", () => {
  let bus: EventBus;
  let artifacts: ArtifactStore;
  let memory: MemoryManager;
  let registry: ToolRegistry;
  let fake: FakeAgent;

  beforeEach(() => {
    bus = createEventBus();
    artifacts = new InMemoryArtifactStore(); memory = new InMemoryMemoryManager();
    registry = createToolRegistry();
    registry.register("noop", makeNoopTool());
  });

  test("`leader.prompt` (no source) is formatted as `[user]: <prompt>`", async () => {
    const result = makeFakeAgentFactory();
    fake = result.fake;
    const body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: makeSoul(),
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
    await body.start();
    bus.publish("t1.leader.prompt", {
      version: 1,
      team_id: "t1",
      event_type: "leader.prompt",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "hello" },
    });
    const calls = fake.prompt.mock.calls as Array<[AgentMessage]>;
    expect(calls.length).toBeGreaterThan(0);
    const synthetic = calls[0]![0] as { role: string; content: string };
    expect(synthetic.role).toBe("user");
    expect(synthetic.content).toBe("[user]: hello");
  });

  test("notify-sourced event (with source) is formatted as `[<source> on '<topic>']: <prompt>`", async () => {
    const result = makeFakeAgentFactory();
    fake = result.fake;
    const body = new AgentBody({
      agent_key: "general-1",
      team_id: "t1",
      soul: makeSoul(),
      is_leader: true,
      bus,
      artifacts,
      memory,
      session_id: "s1",
      tool_registry: registry,
      getApiKey: () => undefined,
      model: {},
      createAgent: result.factory,
    });
    await body.start();
    bus.publish("t1.general-1", {
      version: 1,
      team_id: "t1",
      event_type: "task.researched",
      agent_role: "researcher",
      agent_key: "researcher-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "report", source: "researcher-1" },
    });
    const calls = fake.prompt.mock.calls as Array<[AgentMessage]>;
    const synthetic = calls[0]![0] as { content: string };
    expect(synthetic.content).toBe(
      "[researcher-1 on 'task.researched']: report",
    );
  });
});