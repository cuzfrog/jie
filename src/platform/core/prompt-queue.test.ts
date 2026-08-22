import type { AgentMessage } from "@earendil-works/pi-agent-core";
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
});

describe("PromptQueue — steer", () => {
  test("steer delegates to dispatcher.steer immediately, bypassing the queue array and queue-update events", () => {
    const message: AgentMessage = { role: "user", content: "steer me", timestamp: 0 };
    makeQueue().steer(message);
    expect(dispatcher.steer).toHaveBeenCalledTimes(1);
    expect(dispatcher.steer).toHaveBeenCalledWith(message);
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    expect(dispatcher.followUp).not.toHaveBeenCalled();
    expect(queueUpdates()).toHaveLength(0);
  });

  test("steer works while the dispatcher is streaming", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const message: AgentMessage = { role: "user", content: "steer me", timestamp: 0 };
    makeQueue().steer(message);
    expect(dispatcher.steer).toHaveBeenCalledTimes(1);
    expect(dispatcher.steer).toHaveBeenCalledWith(message);
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

  test("ingress while the dispatcher is streaming queues without dispatching", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    await flush();
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    expect(queue.isEmpty()).toBe(false);
  });

  test("queue snapshots carry the raw user text", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    expect(lastSnapshot()).toEqual([{ text: "hello", source: "user", chained: false }]);
    queue.ingestPeerNotification("task.recorded", "leader-1", "do X");
    expect(lastSnapshot()).toEqual([
      { text: "hello", source: "user", chained: false },
      { text: "[leader-1 on 'task.recorded']: do X", source: "peer", chained: false },
    ]);
  });
});

describe("PromptQueue — dispatch", () => {
  test("dispatch runs beforeDispatch before prompting the head entry", async () => {
    const order: string[] = [];
    beforeDispatch.mockImplementation(async () => {
      order.push("settle");
    });
    dispatcher.prompt.mockImplementation(() => {
      order.push("prompt");
    });
    makeQueue().ingestUserPrompt("hello", "hello");
    await flush();
    expect(order).toEqual(["settle", "prompt"]);
  });

  test("dispatchNext prompts the head once the dispatcher is idle again", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    dispatcher.isStreaming.mockReturnValue(false);
    await queue.dispatchNext();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
  });

  test("successive dispatches drain the queue in arrival order", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    dispatcher.isStreaming.mockReturnValue(false);
    await queue.dispatchNext();
    await queue.dispatchNext();
    expect(dispatcher.prompt.mock.calls.map((call) => (call[0] as { content: string }).content)).toEqual([
      "first",
      "second",
    ]);
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
    expect(queue.isEmpty()).toBe(false);
  });
});

describe("PromptQueue — follow-up drain", () => {
  test("drainForFollowUp feeds the head entry to followUp and keeps it visible as chained", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    expect(dispatcher.followUp).toHaveBeenCalledTimes(1);
    const message = dispatcher.followUp.mock.calls[0]![0];
    expect(message).toMatchObject({ role: "user", content: "first", displayText: "first" });
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: true }]);
  });

  test("drainForFollowUp on an errored turn leaves the entry queued for a later prompt dispatch", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(true);
    expect(dispatcher.followUp).not.toHaveBeenCalled();
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
    dispatcher.isStreaming.mockReturnValue(false);
    await queue.settle();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
  });

  test("drainForFollowUp republishes the snapshot even when nothing was drained", () => {
    const queue = makeQueue();
    const countBefore = queueUpdates().length;
    queue.drainForFollowUp(true);
    expect(queueUpdates().length).toBe(countBefore + 1);
  });

  test("multiple drains stack chained entries ahead of the remaining queue", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.drainForFollowUp(false);
    queue.drainForFollowUp(false);
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: true },
      { text: "second", source: "user", chained: true },
    ]);
  });

  test("consumeChained removes the matching message from the chained list and republishes", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    const message = dispatcher.followUp.mock.calls[0]![0];
    const countBefore = queueUpdates().length;
    queue.consumeChained(message);
    expect(lastSnapshot()).toEqual([]);
    expect(queueUpdates().length).toBe(countBefore + 1);
  });

  test("consumeChained with an unknown message is a silent no-op", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    const countBefore = queueUpdates().length;
    queue.consumeChained({ role: "user", content: "other", timestamp: 0 });
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: true }]);
    expect(queueUpdates().length).toBe(countBefore);
  });
});

describe("PromptQueue — dequeue", () => {
  test("removes the last queue entry matching the raw user text and republishes the snapshot", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.dequeue("second");
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
  });

  test("with duplicated texts, removes the tail-most match only", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("same", "same");
    queue.ingestUserPrompt("same", "same");
    queue.dequeue("same");
    expect(lastSnapshot()).toEqual([{ text: "same", source: "user", chained: false }]);
  });

  test("dequeuing a user prompt leaves peer notifications queued", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.ingestPeerNotification("task.recorded", "leader-1", "do X");
    queue.dequeue("hello");
    expect(lastSnapshot()).toEqual([{ text: "[leader-1 on 'task.recorded']: do X", source: "peer", chained: false }]);
  });

  test("no match: nothing is removed and the snapshot is republished so a stale observer resyncs", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const countBefore = queueUpdates().length;
    queue.dequeue("already consumed");
    expect(queueUpdates().length).toBe(countBefore + 1);
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
  });

  test("dequeued entries park and cap: past the cap the oldest parked prompt is evicted", () => {
    dispatcher.isStreaming.mockReturnValue(true);
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
  });
});

describe("PromptQueue — requeue", () => {
  test("restores a dequeued user prompt to the queue tail and republishes the snapshot", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.dequeue("second");
    queue.requeue("second");
    expect(lastSnapshot()).toEqual([
      { text: "first", source: "user", chained: false },
      { text: "second", source: "user", chained: false },
    ]);
  });

  test("the restored entry keeps its constructed message when drained", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    queue.requeue("hello");
    dispatcher.isStreaming.mockReturnValue(false);
    await queue.settle();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "hello", displayText: "hello" });
  });

  test("requeuing while idle drains the restored entry immediately", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    dispatcher.isStreaming.mockReturnValue(false);
    queue.requeue("hello");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
  });

  test("no matching dequeued entry: the queue is unchanged and the snapshot is republished", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const countBefore = queueUpdates().length;
    queue.requeue("never dequeued");
    expect(queueUpdates().length).toBe(countBefore + 1);
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user", chained: false }]);
  });

  test("a resubmitted dequeued prompt is consumed and not restored a second time", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.dequeue("hello");
    queue.consumeResubmitted("hello");
    queue.requeue("hello");
    expect(lastSnapshot()).toEqual([]);
  });
});
