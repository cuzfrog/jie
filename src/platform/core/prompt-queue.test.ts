import type { AgentSender, EventEnvelope, EventManager } from "../event";
import { PromptQueueImpl, type PromptDispatcher, type PromptQueue } from "./prompt-queue";

type QueueUpdateEnvelope = EventEnvelope<"agent.prompt.queue.update">;

const dispatcher = vi.mocked<PromptDispatcher>({
  prompt: vi.fn(),
  followUp: vi.fn(),
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

function lastSnapshot(): ReadonlyArray<{ text: string; source: "user" | "peer" }> {
  const updates = queueUpdates();
  return updates[updates.length - 1]!.payload.prompts;
}

beforeEach(() => {
  dispatcher.isStreaming.mockReturnValue(false);
});

describe("PromptQueue — ingress", () => {
  test("ingestUserPrompt dispatches a [user]: prefixed message carrying the raw text as displayText", async () => {
    makeQueue().ingestUserPrompt("hello", "hello");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "[user]: hello", displayText: "hello" });
  });

  test("ingestPeerNotification dispatches a [<source> on '<topic>']: prefixed message without displayText", async () => {
    makeQueue().ingestPeerNotification("task.recorded", "leader-1", "do X");
    await flush();
    expect(dispatcher.prompt).toHaveBeenCalledTimes(1);
    const message = dispatcher.prompt.mock.calls[0]![0];
    expect(message).toMatchObject({ role: "user", content: "[leader-1 on 'task.recorded']: do X" });
    expect("displayText" in message).toBe(false);
  });

  test("ingress while the dispatcher is streaming queues without dispatching", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    await flush();
    expect(dispatcher.prompt).not.toHaveBeenCalled();
    expect(queue.isEmpty()).toBe(false);
  });

  test("queue snapshots carry the raw user text without the synthetic prefix", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    expect(lastSnapshot()).toEqual([{ text: "hello", source: "user" }]);
    queue.ingestPeerNotification("task.recorded", "leader-1", "do X");
    expect(lastSnapshot()).toEqual([
      { text: "hello", source: "user" },
      { text: "[leader-1 on 'task.recorded']: do X", source: "peer" },
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
      "[user]: first",
      "[user]: second",
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
  test("drainForFollowUp feeds the head entry to followUp and labels it for its turn", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(false);
    expect(dispatcher.followUp).toHaveBeenCalledTimes(1);
    const message = dispatcher.followUp.mock.calls[0]![0];
    expect(message).toMatchObject({ role: "user", content: "[user]: first" });
    expect(lastSnapshot()).toEqual([]);
    expect(queue.takeTurnStartLabel(message)).toBe("first");
  });

  test("drainForFollowUp on an errored turn leaves the entry queued for a later prompt dispatch", async () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.drainForFollowUp(true);
    expect(dispatcher.followUp).not.toHaveBeenCalled();
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user" }]);
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
});

describe("PromptQueue — turn-start labels", () => {
  test("takeTurnStartLabel consumes the pending prompt label once", async () => {
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    await flush();
    expect(queue.takeTurnStartLabel(null)).toBe("hello");
    expect(queue.takeTurnStartLabel(null)).toBeNull();
  });

  test("a follow-up label wins over the pending label for the follow-up message", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("queued", "queued");
    queue.drainForFollowUp(false);
    const message = dispatcher.followUp.mock.calls[0]![0];
    expect(queue.takeTurnStartLabel(message)).toBe("queued");
    expect(queue.takeTurnStartLabel(null)).toBeNull();
  });

  test("dropFollowUpLabel removes a label before a flush consumes it", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("queued", "queued");
    queue.drainForFollowUp(false);
    const message = dispatcher.followUp.mock.calls[0]![0];
    queue.dropFollowUpLabel(message);
    expect(queue.takeTurnStartLabel(message)).toBeNull();
  });

  test("clearPendingLabel discards the pending label", async () => {
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    await flush();
    queue.clearPendingLabel();
    expect(queue.takeTurnStartLabel(null)).toBeNull();
  });
});

describe("PromptQueue — dequeue", () => {
  test("removes the last queue entry matching the raw user text and republishes the snapshot", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    queue.ingestUserPrompt("second", "second");
    queue.dequeue("second");
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user" }]);
  });

  test("with duplicated texts, removes the tail-most match only", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("same", "same");
    queue.ingestUserPrompt("same", "same");
    queue.dequeue("same");
    expect(lastSnapshot()).toEqual([{ text: "same", source: "user" }]);
  });

  test("dequeuing a user prompt leaves peer notifications queued", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("hello", "hello");
    queue.ingestPeerNotification("task.recorded", "leader-1", "do X");
    queue.dequeue("hello");
    expect(lastSnapshot()).toEqual([{ text: "[leader-1 on 'task.recorded']: do X", source: "peer" }]);
  });

  test("no match: nothing is removed and the snapshot is republished so a stale observer resyncs", () => {
    dispatcher.isStreaming.mockReturnValue(true);
    const queue = makeQueue();
    queue.ingestUserPrompt("first", "first");
    const countBefore = queueUpdates().length;
    queue.dequeue("already consumed");
    expect(queueUpdates().length).toBe(countBefore + 1);
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user" }]);
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
    expect(lastSnapshot()).toEqual([{ text: "p1", source: "user" }]);
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
      { text: "first", source: "user" },
      { text: "second", source: "user" },
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
    expect(dispatcher.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "[user]: hello", displayText: "hello" });
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
    expect(lastSnapshot()).toEqual([{ text: "first", source: "user" }]);
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
