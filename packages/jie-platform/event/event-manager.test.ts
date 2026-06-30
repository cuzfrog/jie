import { createEventBus, type EventBus } from "./event-bus";
import {
  createEventManager,
  type EventManager,
} from "./event-manager";
import { Events, type EventEnvelope, type Sender } from "./events";

function collect(bus: EventBus, subject: string): unknown[] {
  const out: unknown[] = [];
  bus.subscribe(subject, (_s, p) => {
    out.push(p);
  });
  return out;
}

const agentSender: Sender = {
  kind: "agent",
  identity: { teamId: "t1", agentRole: "general", agentKey: "general-1" },
};

const systemSender: Sender = { kind: "system" };
const userSender: Sender = { kind: "user" };

describe("createEventManager — envelope stamping", () => {
  test("stamps version, type, sender, timestamp", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.turn.start");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentTurnStart(agentSender));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"agent.turn.start">;
    expect(env.version).toBe(1);
    expect(env.topic).toBe("agent.turn.start");
    expect(env.sender).toEqual(agentSender);
    expect(typeof env.timestamp).toBe("string");
  });

  test("payload is passed through for non-tool topics", () => {
    const bus = createEventBus();
    const received = collect(bus, "user.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.userPrompt(userSender, "t1", "hello", "general-1"));
    const env = received[0] as EventEnvelope<"user.prompt">;
    expect(env.payload).toEqual({ teamId: "t1", agentKey: "general-1", prompt: "hello" });
  });

  test("agent.idle has null payload", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.idle");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentIdle(agentSender, "stop"));
    const env = received[0] as EventEnvelope<"agent.idle">;
    expect(env.payload).toBe("stop");
  });

  test("system sender on system.team.loaded envelope has kind 'system'", () => {
    const bus = createEventBus();
    const received = collect(bus, "system.team.loaded");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.teamLoaded(systemSender, "t1", []));
    const env = received[0] as EventEnvelope<"system.team.loaded">;
    expect(env.sender.kind).toBe("system");
    expect(env.topic).toBe("system.team.loaded");
  });
});

describe("createEventManager — topic shape", () => {
  test("agent.tool.call publishes on its static subject", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", "{}"));
    expect(received).toHaveLength(1);
  });

  test("userPrompt publishes to the static 'user.prompt' topic with teamId/agentKey in payload", () => {
    const bus = createEventBus();
    const received = collect(bus, "user.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.userPrompt(userSender, "t1", "hi", "general-1"));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"user.prompt">;
    expect(env.topic).toBe("user.prompt");
    expect(env.sender).toEqual(userSender);
    expect(env.payload).toEqual({ teamId: "t1", agentKey: "general-1", prompt: "hi" });
  });

  test("userPrompt targeted to a non-leader agentKey still resolves", () => {
    const bus = createEventBus();
    const received = collect(bus, "user.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.userPrompt(userSender, "t1", "go", "worker-2"));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"user.prompt">;
    expect(env.topic).toBe("user.prompt");
    expect(env.payload).toEqual({ teamId: "t1", agentKey: "worker-2", prompt: "go" });
  });

  test("teamLoaded publishes to the static 'system.team.loaded' topic", () => {
    const bus = createEventBus();
    const received = collect(bus, "system.team.loaded");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.teamLoaded(systemSender, "t1", [{ role: "leader", agent_key: "leader-1", is_leader: true }]));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"system.team.loaded">;
    expect(env.topic).toBe("system.team.loaded");
  });

  test("interruptTeam publishes to 'system.team.interrupted'", () => {
    const bus = createEventBus();
    const received = collect(bus, "system.team.interrupted");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.interruptTeam(systemSender, "t1"));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"system.team.interrupted">;
    expect(env.topic).toBe("system.team.interrupted");
  });

  test("custom prefixes the clientTopic with custom.", () => {
    const bus = createEventBus();
    const received = collect(bus, "custom.t1.task");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.custom(agentSender, "t1.task", "x"));
    expect(received).toHaveLength(1);
    const env = received[0] as { topic: string; payload: unknown };
    expect(env.topic).toBe("custom.t1.task");
    expect(env.payload).toEqual("x");
  });
});

describe("createEventManager — subscribe", () => {
  test("subscribe callback receives typed envelope on static topic", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<"user.prompt">[] = [];
    const off = events.subscribe("user.prompt", (e) => {
      received.push(e as EventEnvelope<"user.prompt">);
    });
    events.publish(Events.userPrompt(userSender, "t1", "hello", "general-1"));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload.prompt).toBe("hello");
    expect(received[0]!.sender.kind).toBe("user");
    off();
    events.publish(Events.userPrompt(userSender, "t1", "world", "general-1"));
    expect(received).toHaveLength(1);
  });

  test("subscribe receives bare subject events as agent.*", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<"agent.stream.chunk">[] = [];
    events.subscribe("agent.stream.chunk", (e) => {
      received.push(e as EventEnvelope<"agent.stream.chunk">);
    });
    events.publish(Events.agentStreamChunk(agentSender, 1, 1, "text", "hello"));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload.text).toBe("hello");
  });

  test("subscribe to a custom-prefixed topic receives the wrapped envelope", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: { topic: string; payload: unknown }[] = [];
    events.subscribe("custom.t1.task.recorded", (e) => {
      received.push(e as unknown as { topic: string; payload: unknown });
    });
    events.publish(Events.custom(agentSender, "t1.task.recorded", "go"));
    expect(received).toHaveLength(1);
    expect(received[0]!.topic).toBe("custom.t1.task.recorded");
    expect(received[0]!.payload).toEqual("go");
  });

  test("subscriberCount counts subscribers for the given subject", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    expect(events.subscriberCount("user.prompt")).toBe(0);
    events.subscribe("user.prompt", () => {});
    expect(events.subscriberCount("user.prompt")).toBe(1);
    expect(events.subscriberCount("custom.t1.task.recorded")).toBe(0);
    events.subscribe("custom.t1.task.recorded", () => {});
    expect(events.subscriberCount("custom.t1.task.recorded")).toBe(1);
  });
});

describe("createEventManager — stream events pass through", () => {
  test("agent.stream.chunk payload is preserved", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.stream.chunk");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentStreamChunk(agentSender, 7, 3, "thinking", "reasoning..."));
    const env = received[0] as EventEnvelope<"agent.stream.chunk">;
    expect(env.payload).toEqual({
      stream_id: 7,
      seq: 3,
      block_type: "thinking",
      text: "reasoning...",
    });
  });

  test("agent.stream.end payload is preserved", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.stream.end");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentStreamEnd(agentSender, 7, 5));
    const env = received[0] as EventEnvelope<"agent.stream.end">;
    expect(env.payload).toEqual({ stream_id: 7, total_chunks: 5 });
  });
});

describe("createEventManager — tool payload pass-through", () => {
  test("agent.tool.call: short input passes through", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", '{"command":"ls"}'));
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload).toEqual({
      tool_call_id: "c1",
      name: "bash",
      input: '{"command":"ls"}',
      input_truncated: false,
    });
  });

  test("agent.tool.call: long input gets truncated and input_truncated=true", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", "x".repeat(8000)));
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload.input_truncated).toBe(true);
    expect(env.payload.input).toContain("chars truncated");
    expect(env.payload.input.length).toBeLessThan(8000);
  });

  test("agent.tool.result: error path leaves output null", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolResult(agentSender, "c1", "bash", null, 100, "boom"));
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output).toBeNull();
    expect(env.payload.output_truncated).toBe(false);
    expect(env.payload.error).toBe("boom");
  });

  test("agent.tool.result: long output gets truncated", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolResult(agentSender, "c1", "bash", "y".repeat(8000), 100, null));
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output_truncated).toBe(true);
    expect(env.payload.output).toContain("chars truncated");
  });
});