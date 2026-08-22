import type { AgentSender, EventEnvelope, EventManager } from "../event";
import { PromptQueueImpl, type PromptDispatcher, type PromptQueue } from "./prompt-queue";

type QueueUpdateEnvelope = EventEnvelope<"agent.prompt.queue.update">;

const dispatcher = vi.mocked<PromptDispatcher>({
  prompt: vi.fn(),
  followUp: vi.fn(),
  steer: vi.fn(),
  isStreaming: vi.fn(),
});

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const beforeDispatch = vi.fn(async () => {});

const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

function makeQueue(): PromptQueue {
  return new PromptQueueImpl({ dispatcher, eventManager, sender, beforeDispatch });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeGate(): { gate: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { gate, release };
}

function queueUpdates(): QueueUpdateEnvelope[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is QueueUpdateEnvelope => env.topic === "agent.prompt.queue.update");
}

function lastSnapshot(): ReadonlyArray<{ text: string; source: "user" | "peer" | "system"; chained: boolean }> {
  const updates = queueUpdates();
  return updates[updates.length - 1]!.payload.prompts;
}

beforeEach(() => {
  dispatcher.isStreaming.mockReturnValue(false);
  beforeDispatch.mockImplementation(async () => {});
});

describe("PromptQueue — steer by default", () => {
  test("streaming ingest releases all queued entries via steer in FIFO order", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    expect(dispatcher.steer).toHaveBeenCalledTimes(2);
    expect(dispatcher.steer.mock.calls[0]![0]).toMatchObject({ role: "user", content: "first", displayText: "first" });
    expect(dispatcher.steer.mock.calls[1]![0]).toMatchObject({ role: "user", content: "second", displayText: "second" });
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    expect(dispatcher.followUp).not.toHaveBeenCalled();
    expect(queue.isEmpty()).toBe(true);
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: true },
      { text: "second", source: "user", chained: true },
    ]);
  });

  test("a chained entry released via steer is removed by consumeChained", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const message = dispatcher.steer.mock.calls[0]![0];
    const countBefore = queueUpdates().length;
    queue.consumeChained(message);
    expect(lastSnapshot()).toEqual([]);
    expect(queueUpdates().length).toBe(countBefore + 1);
  });
});

describe("PromptQueue — ingress", () => {
  test("ingestUserPrompt dispatches a bare-content message carrying the raw text as displayText", async () => {
    makeQueue().ingestUserPrompt("hello", "hello");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "hello", displayText: "hello" });
  });

  test("ingestPeerNotification dispatches a [<source> on '<topic>']: prefixed message with the prompt as displayText", async () => {
    makeQueue().ingestPeerNotification("task.recorded", "leader-1", "do X");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    const message = dispatcher.prompt.mock.calls[0]![0];
    expect(message).toMatchObject({
      role: "user",
      content: "[leader-1 on 'task.recorded']: do X",
      displayText: "do X",
    });
  });

  test("ingestSystemPrompt dispatches the bare message through the idle path", async () => {
    const queue = makeQueue();
    queue.ingestSystemPrompt({ role: "user", content: "continue", timestamp: 0 });
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "continue", timestamp: 0 });
    expect(lastSnapshot()).toEqual([]);
    expect(queue.isEmpty()).toBe(true);
  });

  test("ingestSystemPrompt while streaming releases via steer and carries source system", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestSystemPrompt({ role: "user", content: "continue", timestamp: 0 });
    expect(dispatcher.steer).toHaveBeenCalledTimes(1);
    expect(dispatcher.steer.mock.calls[0]![0]).toMatchObject({ role: "user", content: "continue", timestamp: 0 });
    expect(queue.isEmpty()).toBe(true);
    expect(lastSnapshot()).toEqual([{ text: "continue", source: "system", chained: true }]);
  });
});

describe("PromptQueue — dispatch", () => {
  test("dispatch runs beforeDispatch before prompting the head entry", async () => {
    const order: string[] = [];
    beforeDispatch.mockImplementation(async () => { order.push("settle"); });
    dispatcher.prompt.mockImplementation(() => { order.push("prompt"); });
    makeQueue().ingestUserPrompt("hello", "hello");
    await flush();
    expect(order).toEqual(["settle", "prompt"]);
  });

  test("dispatchNext releases via steer while streaming and prompts new entries once idle", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    expect(dispatcher.steer).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    dispatcher.isStreaming.mockReturnValue(false);
    queue.ingestUserPrompt("second", "second");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "second", displayText: "second" });
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: true }]);
  });

  test("successive dispatches drain the queue in arrival order", async () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    release();
    await flush();
    await queue.dispatchNext();
    expect(dispatcher.prompt.mock.calls.map((call) => (call[0] as { content: string }).content)).toEqual(["first", "second"]);
  });

  test("settle runs beforeDispatch even when the queue is empty", async () => {
    await makeQueue().settle();
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt).not.toHaveBeenCalled();
  });

  test("stop prevents any further dispatch", async () => {
    const queue = makeQueue();
    queue.stop();
    queue.ingestUserPrompt("hello", "hello");
    await queue.dispatchNext();
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    expect(dispatcher.steer).not.toHaveBeenCalled();
    expect(queue.isEmpty()).toBe(false);
  });
});

describe("PromptQueue — follow-up drain", () => {
  test("drainForFollowUp on a non-error turn releases all entries via followUp and marks them chained", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.drainForFollowUp(false);
    expect(dispatcher.followUp).toHaveBeenCalledTimes(2);
    expect(dispatcher.followUp.mock.calls[0]![0]).toMatchObject({ role: "user", content: "first", displayText: "first" });
    expect(dispatcher.followUp.mock.calls[1]![0]).toMatchObject({ role: "user", content: "second", displayText: "second" });
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: true },
      { text: "second", source: "user", chained: true },
    ]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("drainForFollowUp on an errored turn leaves all entries queued", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.drainForFollowUp(true);
    expect(dispatcher.followUp).not.toHaveBeenCalled();
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: false },
      { text: "second", source: "user", chained: false },
    ]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("drainForFollowUp republishes the snapshot even when nothing was drained", () => {
    const queue = makeQueue();
    const countBefore = queueUpdates().length;
    queue.drainForFollowUp(true);
    expect(queueUpdates().length).toBe(countBefore + 1);
  });

  test("multiple drains stack chained entries ahead of the remaining queue", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.drainForFollowUp(false);
    queue.drainForFollowUp(false);
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: true },
      { text: "second", source: "user", chained: true },
    ]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("consumeChained removes the matching message from the chained list and republishes", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    const message = dispatcher.followUp.mock.calls[0]![0];
    const countBefore = queueUpdates().length;
    queue.consumeChained(message);
    expect(lastSnapshot()).toEqual([]);
    expect(queueUpdates().length).toBe(countBefore + 1);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("consumeChained with an unknown message is a silent no-op", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    const countBefore = queueUpdates().length;
    queue.consumeChained({ role: "user", content: "other", timestamp: 0 });
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: true }]);
    expect(queueUpdates().length).toBe(countBefore);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });
});

describe("PromptQueue — dequeue", () => {
  test("removes the last queue entry matching the raw user text and republishes the snapshot", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.dequeue("second");
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("with duplicated texts, removes the tail-most match only", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("same", "same");
    queue.ingestUserPrompt("same", "same");
    queue.dequeue("same");
    expect(lastSnapshot()).toEqual([{ text: "same", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("dequeuing a user prompt leaves peer notifications queued", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.ingestPeerNotification("task.recorded", "leader-1", "do X");
    queue.dequeue("hello");
    expect(lastSnapshot()).toEqual([{ text: "[leader-1 on 'task.recorded']: do X", source: "peer", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("no match: nothing is removed and the snapshot is republished so a stale observer resyncs", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const countBefore = queueUpdates().length;
    queue.dequeue("already consumed");
    expect(queueUpdates().length).toBe(countBefore + 1);
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("dequeued entries park and cap: past the cap the oldest parked prompt is evicted", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    for (let i = 0; i < 33; i++) {
      queue.ingestUserPrompt(`p${i}`, `p${i}`);
    }
    for (let i = 0; i < 33; i++) {
      queue.dequeue(`p${i}`);
    }
    queue.requeue("p0");
    expect(lastSnapshot()).toEqual([]);
    queue.requeue("p1");
    expect(lastSnapshot()).toEqual([{ text: "p1", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });
});

describe("PromptQueue — requeue", () => {
  test("restores a dequeued user prompt to the queue tail and republishes the snapshot", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.dequeue("second");
    queue.requeue("second");
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: false },
      { text: "second", source: "user", chained: false },
    ]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("the restored entry keeps its constructed message when drained", async () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    queue.requeue("hello");
    dispatcher.isStreaming.mockReturnValue(false);
    release();
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "hello", displayText: "hello" });
  });

  test("requeuing while idle drains the restored entry immediately", async () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    dispatcher.isStreaming.mockReturnValue(false);
    queue.requeue("hello");
    release();
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
  });

  test("no matching dequeued entry: the queue is unchanged and the snapshot is republished", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const countBefore = queueUpdates().length;
    queue.requeue("never dequeued");
    expect(queueUpdates().length).toBe(countBefore + 1);
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });

  test("a resubmitted dequeued prompt is consumed and not restored a second time", () => {
    const { gate, release } = makeGate();
    beforeDispatch.mockImplementation(() => gate);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    queue.consumeResubmitted("hello");
    queue.requeue("hello");
    expect(lastSnapshot()).toEqual([]);
    dispatcher.isStreaming.mockReturnValue(true);
    release();
  });
});
