import { beforeEach, describe, expect, test } from "bun:test";
import { InProcessEventBus } from "./in-process-event-bus.ts";
import {
  makeStreamPublisher,
  publishPlatformEvent,
  publishToolCallEvent,
  publishToolResultEvent,
  truncateForTelemetry,
} from "./streaming.ts";
import type { AgentEvent } from "./agent-event.ts";

describe("truncateForTelemetry", () => {
  test("input <= 4 KiB is unchanged", () => {
    const s = "x".repeat(1024);
    const r = truncateForTelemetry(s);
    expect(r.text).toBe(s);
    expect(r.truncated).toBe(false);
  });

  test("input > 4 KiB is middle-truncated with a chars-truncated marker", () => {
    const s = "x".repeat(8000);
    const r = truncateForTelemetry(s);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(s.length);
    expect(r.text).toContain("chars truncated");
  });
});

describe("makeStreamPublisher", () => {
  let bus: InProcessEventBus;
  const agentKey = "general-1";
  const agentRole = "general";
  const teamId = "t1";

  beforeEach(() => {
    bus = new InProcessEventBus();
  });

  function makeStream() {
    return makeStreamPublisher(bus, agentKey, agentRole, teamId);
  }

  function collectChunks(): AgentEvent[] {
    const out: AgentEvent[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      out.push(p as AgentEvent);
    });
    return out;
  }

  test("append at >= 64 chars flushes immediately", () => {
    const stream = makeStream();
    void collectChunks();
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    const envelopes = (bus as unknown as { _subs?: Map<string, Set<unknown>> })._subs;
    void envelopes;
  });

  test("emits agent.stream.chunk when text delta reaches 64 chars", () => {
    const stream = makeStream();
    const chunks: AgentEvent[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p as AgentEvent);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("block_type change flushes the prior block before appending the new one", () => {
    const stream = makeStream();
    const chunks: AgentEvent[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p as AgentEvent);
    });
    stream.beginStream();
    stream.append("text", "hello");
    stream.append("thinking", "world");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.payload.block_type).toBe("text");
  });

  test("endStream publishes agent.stream.end with stream_id and total_chunks", () => {
    const stream = makeStream();
    const ends: AgentEvent[] = [];
    bus.subscribe("agent.stream.end", (_s, p) => {
      ends.push(p as AgentEvent);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    stream.append("text", "y".repeat(64));
    const out = stream.endStream();
    expect(out.total_chunks).toBe(2);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.payload).toEqual({ stream_id: 1, total_chunks: 2 });
  });
});

describe("publishToolCallEvent", () => {
  test("emits agent.tool.call with truncated JSON-serialized input", () => {
    const bus = new InProcessEventBus();
    const received: AgentEvent[] = [];
    bus.subscribe("agent.tool.call", (_s, p) => {
      received.push(p as AgentEvent);
    });
    publishToolCallEvent(bus, "general-1", "general", "t1", "call_1", "bash", {
      command: "echo ok",
    });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "call_1",
      name: "bash",
    });
    expect(received[0]!.payload.input).toContain("echo ok");
  });
});

describe("publishToolResultEvent", () => {
  test("emits agent.tool.result with duration_ms and serialized output", () => {
    const bus = new InProcessEventBus();
    const received: AgentEvent[] = [];
    bus.subscribe("agent.tool.result", (_s, p) => {
      received.push(p as AgentEvent);
    });
    publishToolResultEvent(
      bus,
      "general-1",
      "general",
      "t1",
      "call_1",
      "bash",
      { content: [{ type: "text", text: "ok" }] },
      42,
      null,
    );
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "call_1",
      name: "bash",
      duration_ms: 42,
      error: null,
    });
  });

  test("error path: error string is set; output is null", () => {
    const bus = new InProcessEventBus();
    const received: AgentEvent[] = [];
    bus.subscribe("agent.tool.result", (_s, p) => {
      received.push(p as AgentEvent);
    });
    publishToolResultEvent(
      bus,
      "general-1",
      "general",
      "t1",
      "call_1",
      "bash",
      { content: "boom" },
      100,
      "boom",
    );
    expect(received[0]!.payload.error).toBe("boom");
  });
});

describe("publishPlatformEvent", () => {
  test("emits the platform event with empty payload by default", () => {
    const bus = new InProcessEventBus();
    const received: AgentEvent[] = [];
    bus.subscribe("agent.idle", (_s, p) => {
      received.push(p as AgentEvent);
    });
    publishPlatformEvent(bus, "agent.idle", "general-1", "general", "t1");
    expect(received).toHaveLength(1);
    expect(received[0]!.event_type).toBe("agent.idle");
    expect(received[0]!.payload).toEqual({});
  });
});
