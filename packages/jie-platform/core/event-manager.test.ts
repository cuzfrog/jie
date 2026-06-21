import { describe, expect, test } from "bun:test";
import { createEventBus, type EventBus } from "./event-bus.ts";
import {
  createEventManager,
  type EventManager,
} from "./event-manager.ts";
import type { EventEnvelope, EventPayloadMap, Sender } from "./types.ts";

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
  test("stamps version, event_type, sender, timestamp", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.turn.start");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.turn.start", {}, agentSender);
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"agent.turn.start">;
    expect(env.version).toBe(1);
    expect(env.event_type).toBe("agent.turn.start");
    expect(env.sender).toEqual(agentSender);
    expect(typeof env.timestamp).toBe("string");
  });

  test("payload is passed through for non-tool topics", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.queue.update");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.queue.update", { prompts: ["a", "b"] }, agentSender);
    const env = received[0] as EventEnvelope<"agent.queue.update">;
    expect(env.payload).toEqual({ prompts: ["a", "b"] });
  });

  test("agent.idle takes an empty payload", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.idle");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.idle", {}, agentSender);
    const env = received[0] as EventEnvelope<"agent.idle">;
    expect(env.payload).toEqual({});
  });

  test("CLI sender on team.loaded envelope has kind 'cli'", () => {
    const bus = createEventBus();
    const received = collect(bus, "t1.team.loaded");
    const events: EventManager = createEventManager(bus);
    events.publish("t1.team.loaded", { agents: [] }, { kind: "cli" });
    const env = received[0] as EventEnvelope<"team.loaded">;
    expect(env.sender.kind).toBe("cli");
  });
});

describe("createEventManager — subject is caller-computed", () => {
  test("agent.tool.call publishes on the subject the caller provides", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: "{}",
      input_truncated: false,
    }, agentSender);
    expect(received).toHaveLength(1);
  });

  test("leader.prompt publishes on the full subject caller provides", () => {
    const bus = createEventBus();
    const received = collect(bus, "t1.leader.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish("t1.leader.prompt", { prompt: "hi" }, agentSender);
    expect(received).toHaveLength(1);
    const env = received[0] as EventEnvelope<"leader.prompt">;
    expect(env.payload).toEqual({ prompt: "hi" });
  });

  test("manager does not route — caller is responsible for the full subject", () => {
    const bus = createEventBus();
    const received = collect(bus, "leader.prompt");
    const events: EventManager = createEventManager(bus);
    events.publish("leader.prompt", { prompt: "x" }, agentSender);
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
    events.publish("t1.leader.prompt", { prompt: "hello" }, agentSender);
    expect(received).toHaveLength(1);
    expect((received[0]!.payload as { prompt: string }).prompt).toBe("hello");
    expect(received[0]!.sender.kind).toBe("agent");
    off();
    events.publish("t1.leader.prompt", { prompt: "world" }, agentSender);
    expect(received).toHaveLength(1);
  });

  test("subscribe receives bare subject events as agent.*", () => {
    const bus = createEventBus();
    const events: EventManager = createEventManager(bus);
    const received: EventEnvelope<"agent.stream.chunk">[] = [];
    events.subscribe("agent.stream.chunk", (e) => {
      received.push(e);
    });
    events.publish("agent.stream.chunk", {
      stream_id: 1,
      seq: 1,
      block_type: "text",
      text: "hello",
    }, agentSender);
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
    events.publish("t1.task.recorded", { prompt: "go" }, agentSender);
    expect(received).toHaveLength(1);
    expect(received[0]!.event_type).toBe("t1.task.recorded");
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
    events.publish("agent.stream.chunk", {
      stream_id: 7,
      seq: 3,
      block_type: "thinking",
      text: "reasoning...",
    }, agentSender);
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
    events.publish("agent.stream.end", { stream_id: 7, total_chunks: 5 }, agentSender);
    const env = received[0] as EventEnvelope<"agent.stream.end">;
    expect(env.payload).toEqual({ stream_id: 7, total_chunks: 5 });
  });
});

describe("createEventManager — input validation (truncation)", () => {
  test("short input passes through unchanged", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    const payload: EventPayloadMap["agent.tool.call"] = {
      tool_call_id: "c1",
      name: "bash",
      input: '{"command":"ls"}',
      input_truncated: false,
    };
    events.publish("agent.tool.call", payload, agentSender);
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload).toEqual(payload);
  });

  test("long input gets truncated and input_truncated=true", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: "x".repeat(8000),
      input_truncated: false,
    }, agentSender);
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
    events.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: original,
      input_truncated: true,
    }, agentSender);
    const env = received[0] as EventEnvelope<"agent.tool.call">;
    expect(env.payload.input).toBe(original);
    expect(env.payload.input_truncated).toBe(true);
  });

  test("agent.tool.result: error path leaves output null", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.tool.result", {
      tool_call_id: "c1",
      name: "bash",
      output: null,
      output_truncated: false,
      duration_ms: 100,
      error: "boom",
    }, agentSender);
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output).toBeNull();
    expect(env.payload.output_truncated).toBe(false);
    expect(env.payload.error).toBe("boom");
  });

  test("agent.tool.result: long output gets truncated", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const events: EventManager = createEventManager(bus);
    events.publish("agent.tool.result", {
      tool_call_id: "c1",
      name: "bash",
      output: "y".repeat(8000),
      output_truncated: false,
      duration_ms: 100,
      error: null,
    }, agentSender);
    const env = received[0] as EventEnvelope<"agent.tool.result">;
    expect(env.payload.output_truncated).toBe(true);
    expect(env.payload.output).toContain("chars truncated");
  });
});