import { describe, expect, test } from "bun:test";
import { createEventBus, type EventBus } from "./event-bus.ts";
import {
  createEventManager,
  type EventManager,
} from "./event-manager.ts";
import { Events, type EventEnvelope, type Sender } from "./types.ts";

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

describe("createEventManager — envelope stamping", () => {
  test("stamps version, type, sender, timestamp", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.turn.start");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentTurnStart(agentSender));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"agent.turn.start">;
    expect(env.version).toBe(1);
    expect(env.type).toBe("agent.turn.start");
    expect(env.sender).toEqual(agentSender);
    expect(typeof env.timestamp).toBe("string");
  });

  test("payload is passed through for non-tool topics", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.queue.update");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentQueueUpdate(agentSender, ["a", "b"]));
    const env = received[0] as EventEnvelope<"agent.queue.update">;
    expect(env.payload).toEqual({ prompts: ["a", "b"] });
  });

  test("agent.idle has null payload", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.idle");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentIdle(agentSender));
    const env = received[0] as EventEnvelope<"agent.idle">;
    expect(env.payload).toBeNull();
  });

  test("CLI sender on team.loaded envelope has kind 'cli'", () => {
    const bus = createEventBus();
    const received = collect(bus, "t1.team.loaded");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.envelope({ kind: "cli" }, "t1.team.loaded", { agents: [] }));
    const env = received[0] as EventEnvelope<string>;
    expect(env.sender.kind).toBe("cli");
  });
});

describe("createEventManager — subject is caller-routed", () => {
  test("agent.tool.call publishes on the subject from the envelope", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", "{}", false));
    expect(received).toHaveLength(1);
  });

  test("leader.prompt publishes on the full subject from the envelope", () => {
    const bus = createEventBus();
    const received = collect(bus, "t1.leader.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.envelope(agentSender, "t1.leader.prompt", { prompt: "hi" }));
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<string>;
    expect(env.payload).toEqual({ prompt: "hi" });
  });

  test("manager does not route — caller is responsible for the full subject", () => {
    const bus = createEventBus();
    const received = collect(bus, "leader.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.leaderPrompt(agentSender, "x"));
    expect(received).toHaveLength(1);
  });
});

describe("createEventManager — subscribe", () => {
  test("type-safe subscribe callback receives typed envelope", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<string>[] = [];
    const off = events.subscribe("t1.leader.prompt", (e) => {
      received.push(e);
    });
    events.publish(Events.envelope(agentSender, "t1.leader.prompt", { prompt: "hello" }));
    expect(received).toHaveLength(1);
    expect((received[0]!.payload as { prompt: string }).prompt).toBe("hello");
    expect(received[0]!.sender.kind).toBe("agent");
    off();
    events.publish(Events.envelope(agentSender, "t1.leader.prompt", { prompt: "world" }));
    expect(received).toHaveLength(1);
  });

  test("subscribe receives bare subject events as agent.*", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<"agent.stream.chunk">[] = [];
    events.subscribe("agent.stream.chunk", (e) => {
      received.push(e);
    });
    events.publish(Events.agentStreamChunk(agentSender, 1, 1, "text", "hello"));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload.text).toBe("hello");
  });

  test("subscribe with a runtime topic uses untyped envelope", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<string>[] = [];
    events.subscribe("t1.task.recorded", (e) => {
      received.push(e);
    });
    events.publish(Events.envelope(agentSender, "t1.task.recorded", { prompt: "go" }));
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe("t1.task.recorded");
    expect(received[0]!.payload).toEqual({ prompt: "go" });
  });

  test("subscriberCount counts subscribers for the given subject", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    expect(events.subscriberCount("t1.leader.prompt")).toBe(0);
    events.subscribe("t1.leader.prompt", () => {});
    expect(events.subscriberCount("t1.leader.prompt")).toBe(1);
    expect(events.subscriberCount("t1.task.recorded")).toBe(0);
    events.subscribe("t1.task.recorded", () => {});
    expect(events.subscriberCount("t1.task.recorded")).toBe(1);
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

describe("createEventManager — input validation (truncation)", () => {
  test("short input passes through unchanged", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", '{"command":"ls"}', false));
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload).toEqual({
      tool_call_id: "c1",
      name: "bash",
      input: '{"command":"ls"}',
      input_truncated: false,
    });
  });

  test("long input gets truncated and input_truncated=true", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", "x".repeat(8000), false));
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload.input_truncated).toBe(true);
    expect(env.payload.input).toContain("chars truncated");
    expect(env.payload.input.length).toBeLessThan(8000);
  });

  test("caller-supplied truncated input is preserved", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    const original = "x".repeat(8000);
    events.publish(Events.agentToolCall(agentSender, "c1", "bash", original, true));
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload.input).toBe(original);
    expect(env.payload.input_truncated).toBe(true);
  });

  test("agent.tool.result: error path leaves output null", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolResult(agentSender, "c1", "bash", null, false, 100, "boom"));
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output).toBeNull();
    expect(env.payload.output_truncated).toBe(false);
    expect(env.payload.error).toBe("boom");
  });

  test("agent.tool.result: long output gets truncated", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish(Events.agentToolResult(agentSender, "c1", "bash", "y".repeat(8000), false, 100, null));
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output_truncated).toBe(true);
    expect(env.payload.output).toContain("chars truncated");
  });
});
