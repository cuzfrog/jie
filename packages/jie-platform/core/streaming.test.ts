import { createEventBus, type EventBus } from "../event/event-bus";
import { makeStreamPublisher } from "./streaming";
import { createEventManager } from "../event/event-manager";
import type { Sender } from "../event/events";

describe("makeStreamPublisher", () => {
  let bus: EventBus;
  const agentKey = "general-1";
  const agentRole = "general";
  const teamId = "t1";
  const sender: Sender = { kind: "agent", identity: { teamId, agentRole, agentKey } };

  beforeEach(() => {
    bus = createEventBus();
  });

  function makeStream() {
    const events = createEventManager(bus);
    return makeStreamPublisher(events, sender);
  }

  test("append at >= 64 chars flushes immediately", () => {
    const stream = makeStream();
    const chunks: object[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    expect(chunks).toHaveLength(1);
  });

  test("emits agent.stream.chunk when text delta reaches 64 chars", () => {
    const stream = makeStream();
    const chunks: object[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { payload: object }).payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("block_type change flushes the prior block before appending the new one", () => {
    const stream = makeStream();
    const chunks: object[] = [];
    bus.subscribe("agent.stream.chunk", (_s, p) => {
      chunks.push(p);
    });
    stream.beginStream();
    stream.append("text", "hello");
    stream.append("thinking", "world");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect((chunks[0] as { payload: { block_type: string } }).payload.block_type).toBe("text");
  });

  test("endStream publishes agent.stream.end with stream_id and total_chunks", () => {
    const stream = makeStream();
    const ends: object[] = [];
    bus.subscribe("agent.stream.end", (_s, p) => {
      ends.push(p);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    stream.append("text", "y".repeat(64));
    const out = stream.endStream();
    expect(out.totalChunks).toBe(2);
    expect(ends).toHaveLength(1);
    expect((ends[0] as { payload: object }).payload).toEqual({ stream_id: 1, total_chunks: 2 });
  });

  test("envelope is stamped with sender from constructor", () => {
    const stream = makeStream();
    const ends: object[] = [];
    bus.subscribe("agent.stream.end", (_s, p) => {
      ends.push(p);
    });
    stream.beginStream();
    stream.endStream();
    expect(ends[0]).toMatchObject({ sender, topic: "agent.stream.end" });
  });
});
