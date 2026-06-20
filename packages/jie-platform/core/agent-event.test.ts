import { describe, expect, test } from "bun:test";
import { createEventBus, type EventBus } from "./event-bus.ts";
import { makeAgentEventPublisher } from "./agent-event.ts";
import type { AgentEvent } from "./agent-event.ts";

const identity = { agentKey: "general-1", agentRole: "general", teamId: "t1" };

function collect(bus: EventBus, topic: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  bus.subscribe(topic, (_s, p) => {
    out.push(p as AgentEvent);
  });
  return out;
}

describe("makeAgentEventPublisher — envelope stamping", () => {
  test("stamps version, team_id, agent_role, agent_key, timestamp, event_type=topic", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.turn.start");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.turn.start", {});
    expect(received).toHaveLength(1);
    expect(received[0]!.version).toBe(1);
    expect(received[0]!.team_id).toBe("t1");
    expect(received[0]!.agent_role).toBe("general");
    expect(received[0]!.agent_key).toBe("general-1");
    expect(received[0]!.event_type).toBe("agent.turn.start");
    expect(typeof received[0]!.timestamp).toBe("string");
  });

  test("payload is passed through for non-tool topics", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.queue.update");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.queue.update", { prompts: ["a", "b"] });
    expect(received[0]!.payload).toEqual({ prompts: ["a", "b"] });
  });

  test("agent.idle takes an empty payload", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.idle");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.idle", {});
    expect(received[0]!.payload).toEqual({});
  });
});

describe("makeAgentEventPublisher — agent.tool.call", () => {
  test("short input: not truncated, serialized to string", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: { command: "ls" },
    });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "c1",
      name: "bash",
      input_truncated: false,
    });
    expect(typeof (received[0]!.payload as { input: unknown }).input).toBe("string");
  });

  test("long input: truncated with input_truncated=true", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const publisher = makeAgentEventPublisher(bus, identity);
    const huge = "x".repeat(8000);
    publisher.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: { command: huge },
    });
    expect(received[0]!.payload.input_truncated).toBe(true);
    const inputStr = (received[0]!.payload as { input: string }).input;
    expect(inputStr.length).toBeLessThan(8000);
    expect(inputStr).toContain("chars truncated");
  });

  test("input=null: serialized as 'null' string", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.call");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.tool.call", {
      tool_call_id: "c1",
      name: "bash",
      input: null,
    });
    expect(received[0]!.payload).toMatchObject({
      input: "null",
      input_truncated: false,
    });
  });
});

describe("makeAgentEventPublisher — agent.tool.result", () => {
  test("no error: output is serialized + truncated, duration_ms is set", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.tool.result", {
      tool_call_id: "c1",
      name: "bash",
      output: { content: [{ type: "text", text: "ok" }] },
      durationMs: 42,
      error: null,
    });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "c1",
      name: "bash",
      duration_ms: 42,
      error: null,
      output_truncated: false,
    });
    expect(typeof (received[0]!.payload as { output: unknown }).output).toBe("string");
  });

  test("error path: output is null, output_truncated is false, error is set", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.tool.result");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.tool.result", {
      tool_call_id: "c1",
      name: "bash",
      output: { content: "boom" },
      durationMs: 100,
      error: "boom",
    });
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "c1",
      name: "bash",
      output: null,
      output_truncated: false,
      duration_ms: 100,
      error: "boom",
    });
  });
});

describe("makeAgentEventPublisher — stream events", () => {
  test("agent.stream.chunk payload is passed through", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.stream.chunk");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.stream.chunk", {
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "hello",
    });
    expect(received[0]!.payload).toEqual({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "hello",
    });
  });

  test("agent.stream.end payload is passed through", () => {
    const bus = createEventBus();
    const received = collect(bus, "agent.stream.end");
    const publisher = makeAgentEventPublisher(bus, identity);
    publisher.publish("agent.stream.end", { stream_id: 1, total_chunks: 3 });
    expect(received[0]!.payload).toEqual({ stream_id: 1, total_chunks: 3 });
  });
});
