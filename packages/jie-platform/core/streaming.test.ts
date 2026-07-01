import { createEventManager, type EventManager, type Sender } from "../event";
import { makeStreamPublisher } from "./streaming";

describe("makeStreamPublisher", () => {
  let events: EventManager;
  const agentKey = "general-1";
  const agentRole = "general";
  const teamId = "t1";
  const sender: Sender = { kind: "agent", identity: { teamId, agentRole, agentKey } };

  beforeEach(() => {
    events = createEventManager();
  });

  function makeStream() {
    return makeStreamPublisher(events, sender);
  }

  test("emits agent.stream.chunk when text delta reaches 64 chars", () => {
    const stream = makeStream();
    const chunks: object[] = [];
    events.subscribe("agent.stream.chunk", (env) => {
      chunks.push(env.payload);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("block_type change flushes the prior block before appending the new one", () => {
    const stream = makeStream();
    const chunks: object[] = [];
    events.subscribe("agent.stream.chunk", (env) => {
      chunks.push(env.payload);
    });
    stream.beginStream();
    stream.append("text", "hello");
    stream.append("thinking", "world");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect((chunks[0] as { block_type: string }).block_type).toBe("text");
  });

  test("endStream publishes agent.stream.end with stream_id and total_chunks", () => {
    const stream = makeStream();
    const ends: object[] = [];
    events.subscribe("agent.stream.end", (env) => {
      ends.push(env.payload);
    });
    stream.beginStream();
    stream.append("text", "x".repeat(64));
    stream.append("text", "y".repeat(64));
    const out = stream.endStream();
    expect(out.totalChunks).toBe(2);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toEqual({ stream_id: 1, total_chunks: 2 });
  });

  test("envelope is stamped with sender from constructor", () => {
    const stream = makeStream();
    const received: Array<{ sender: Sender; topic: string }> = [];
    events.subscribe("agent.stream.end", (env) => {
      received.push({ sender: env.sender, topic: env.topic });
    });
    stream.beginStream();
    stream.endStream();
    expect(received).toHaveLength(1);
    expect(received[0]?.sender).toEqual(sender);
    expect(received[0]?.topic).toBe("agent.stream.end");
  });
});
