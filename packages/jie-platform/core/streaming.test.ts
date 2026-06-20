import { beforeEach, describe, expect, test } from "bun:test";
import { createEventBus, type EventBus } from "./event-bus.ts";
import { makeStreamPublisher } from "./streaming.ts";
import { makeAgentEventPublisher } from "./agent-event.ts";
import type { AgentEvent } from "./agent-event.ts";

describe("makeStreamPublisher", () => {
  let bus: EventBus;
  const agentKey = "general-1";
  const agentRole = "general";
  const teamId = "t1";

  beforeEach(() => {
    bus = createEventBus();
  });

  function makeStream() {
    const publisher = makeAgentEventPublisher(bus, { agentKey, agentRole, teamId });
    return makeStreamPublisher(publisher);
  }

  test("append at >= 64 chars flushes immediately", () => {
    const stream = makeStream();
    const chunks: AgentEvent[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p as AgentEvent);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    expect(chunks).toHaveLength(1);
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

  test("envelope is stamped with identity from the publisher", () => {
    const stream = makeStream();
    const ends: AgentEvent[] = [];
    bus.subscribe("agent.stream.end", (_s, p) => {
      ends.push(p as AgentEvent);
    });
    stream.beginStream();
    stream.endStream();
    expect(ends[0]!.team_id).toBe(teamId);
    expect(ends[0]!.agent_key).toBe(agentKey);
    expect(ends[0]!.agent_role).toBe(agentRole);
    expect(ends[0]!.event_type).toBe("agent.stream.end");
  });
});
