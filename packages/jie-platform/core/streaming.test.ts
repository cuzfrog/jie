import { type AgentSender, type EventEnvelope, type EventManager } from "../event";
import { StreamPublisherImpl } from "./streaming";

const events = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

function chunkEnvelopes(): Array<EventEnvelope<"agent.stream.chunk">> {
  return events.publish.mock.calls
    .map((call) => call[0])
    .filter((e): e is EventEnvelope<"agent.stream.chunk"> => e.topic === "agent.stream.chunk");
}

function endEnvelopes(): Array<EventEnvelope<"agent.stream.end">> {
  return events.publish.mock.calls
    .map((call) => call[0])
    .filter((e): e is EventEnvelope<"agent.stream.end"> => e.topic === "agent.stream.end");
}

describe("StreamPublisherImpl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("emits agent.stream.chunk when the buffer reaches 64 chars", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "x".repeat(64));
    const chunks = chunkEnvelopes();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toEqual({ stream_id: 1, seq: 0, block_type: "text", text: "x".repeat(64) });
  });

  test("block_type change flushes the prior block before appending the new one", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "hello");
    publisher.append("thinking", "world");
    const chunks = chunkEnvelopes();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({ stream_id: 1, seq: 0, block_type: "text", text: "hello" });
  });

  test("flushes buffered text after 200ms", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "short");
    expect(chunkEnvelopes()).toHaveLength(0);
    vi.advanceTimersByTime(200);
    const chunks = chunkEnvelopes();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({ stream_id: 1, seq: 0, block_type: "text", text: "short" });
  });

  test("beginStream resets streamId, seq and totals", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "x".repeat(64));
    publisher.endStream();
    publisher.beginStream();
    publisher.append("text", "y".repeat(64));
    const result = publisher.endStream();
    expect(result).toEqual({ streamId: 2, totalChunks: 1 });
    expect(chunkEnvelopes()[1]!.payload).toMatchObject({ stream_id: 2, seq: 0, text: "y".repeat(64) });
  });

  test("endStream flushes the buffer and publishes agent.stream.end with totals", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "x".repeat(64));
    publisher.append("text", "y".repeat(64));
    const result = publisher.endStream();
    expect(result).toEqual({ streamId: 1, totalChunks: 2 });
    const ends = endEnvelopes();
    expect(ends).toHaveLength(1);
    expect(ends[0]!.payload).toEqual({ stream_id: 1, total_chunks: 2 });
  });

  test("envelopes are stamped with the sender from the constructor", () => {
    const publisher = new StreamPublisherImpl(events, sender);
    publisher.beginStream();
    publisher.append("text", "x".repeat(64));
    publisher.endStream();
    const envelopes = events.publish.mock.calls.map((call) => call[0]);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) {
      expect(envelope.sender).toEqual(sender);
    }
  });
});
