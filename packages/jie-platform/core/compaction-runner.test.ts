import { createCompactionSummaryMessage, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { CompactionRunnerImpl, type CompactionRunner } from "./compaction-runner";
import type { CompactionResult, Compactor } from "./compaction";
import type { AgentSender, EventEnvelope, EventManager, EventType } from "../event";
import type { MemoryExtractor } from "../memory";

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const compactor = vi.mocked<Compactor>({
  compact: vi.fn(async () => null),
  fitToWindow: vi.fn((messages) => messages),
});

const memoryExtractor = vi.mocked<MemoryExtractor>({ extract: vi.fn(async () => {}) });

const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

let messages: AgentMessage[] = [];

const conversation = {
  getMessages: (): ReadonlyArray<AgentMessage> => messages,
  setMessages: (next: ReadonlyArray<AgentMessage>) => {
    messages = [...next];
  },
};

function makeRunner(): CompactionRunner {
  return new CompactionRunnerImpl({
    compactor,
    eventManager,
    sender,
    agentKey: "general-1",
    sessionId: "s1",
    teamId: "t1",
    conversation,
    memoryExtractor,
  });
}

function makeUserMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: 0 };
}

function makeModel(provider: string, id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "anthropic-messages" as Api,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

function envelopes<T extends EventType>(topic: T): EventEnvelope<T>[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<T> => env.topic === topic);
}

const model = makeModel("anthropic", "claude-sonnet-4");

beforeEach(() => {
  messages = [makeUserMessage("m1"), makeUserMessage("m2"), makeUserMessage("m3")];
});

describe("CompactionRunner — compact input", () => {
  test("ensure passes the conversation, model window, and identity to the compactor", async () => {
    await makeRunner().ensure(model);
    expect(compactor.compact).toHaveBeenCalledTimes(1);
    const input = compactor.compact.mock.calls[0]![0]!;
    expect(input.messages).toEqual(messages);
    expect(input.contextWindow).toBe(200000);
    expect(input.model).toBe(model);
    expect(input.agentKey).toBe("general-1");
    expect(input.sessionId).toBe("s1");
    expect(input.teamId).toBe("t1");
    expect(input.signal?.aborted).toBe(false);
  });
});

describe("CompactionRunner — applying the result", () => {
  test("a successful run rewrites the conversation to [summary, ...retainedTail]", async () => {
    const [, second, third] = messages;
    const summary = createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z");
    compactor.compact.mockResolvedValueOnce({ summaryMessage: summary, firstKeptIndex: 1, tokensBefore: 500, summarizedPrefix: [messages[0]!] });
    await makeRunner().ensure(model);
    expect(messages).toEqual([summary, second, third]);
  });

  test("a successful run publishes agent.compacted with the summary and prefix counts", async () => {
    messages = [makeUserMessage("m1"), makeUserMessage("m2"), makeUserMessage("m3"), makeUserMessage("m4")];
    compactor.compact.mockResolvedValueOnce({
      summaryMessage: createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z"),
      firstKeptIndex: 3,
      tokensBefore: 500,
      summarizedPrefix: messages.slice(0, 3),
    });
    await makeRunner().ensure(model);
    const compacted = envelopes("agent.compacted");
    expect(compacted).toHaveLength(1);
    expect(compacted[0]!.sender).toEqual(sender);
    expect(compacted[0]!.payload).toEqual({ summary: "the summary", tokens_before: 500, summarized_prompts: 3 });
  });

  test("a successful run hands the summarized prefix to the extractor", async () => {
    messages = [makeUserMessage("m1"), makeUserMessage("m2"), makeUserMessage("m3")];
    compactor.compact.mockResolvedValueOnce({
      summaryMessage: createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z"),
      firstKeptIndex: 1,
      tokensBefore: 500,
      summarizedPrefix: messages.slice(0, 1),
    });
    await makeRunner().ensure(model);
    expect(memoryExtractor.extract).toHaveBeenCalledTimes(1);
    const input = memoryExtractor.extract.mock.calls[0]![0]!;
    expect(input.messages).toEqual([makeUserMessage("m1")]);
    expect(input.teamId).toBe("t1");
    expect(input.sessionId).toBe("s1");
    expect(input.model).toBe(model);
  });

  test("a null result never reaches the extractor", async () => {
    await makeRunner().ensure(model);
    expect(memoryExtractor.extract).not.toHaveBeenCalled();
  });

  test("abort() aborts the extraction signal", async () => {
    let captured: AbortSignal | undefined;
    memoryExtractor.extract.mockImplementationOnce(async (input) => {
      captured = input.signal;
    });
    compactor.compact.mockResolvedValueOnce({
      summaryMessage: createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z"),
      firstKeptIndex: 1,
      tokensBefore: 500,
      summarizedPrefix: messages.slice(0, 1),
    });
    const runner = makeRunner();
    await runner.ensure(model);
    if (captured === undefined) throw new Error("extraction signal not captured");
    expect(captured.aborted).toBe(false);
    runner.abort();
    expect(captured.aborted).toBe(true);
  });

  test("a null result leaves the conversation untouched and publishes nothing", async () => {
    const baseline = [...messages];
    await makeRunner().ensure(model);
    expect(messages).toEqual(baseline);
    expect(envelopes("agent.compacted")).toHaveLength(0);
    expect(envelopes("system.error")).toHaveLength(0);
  });
});

describe("CompactionRunner — dedupe and lifecycle", () => {
  test("concurrent ensure calls share one in-flight compaction", async () => {
    compactor.compact.mockReturnValueOnce(new Promise<CompactionResult | null>(() => {}));
    const runner = makeRunner();
    const first = runner.ensure(model);
    const second = runner.ensure(model);
    await flush();
    expect(compactor.compact).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  test("a subsequent ensure after a settled run starts a new compaction", async () => {
    const runner = makeRunner();
    await runner.ensure(model);
    await runner.ensure(model);
    expect(compactor.compact).toHaveBeenCalledTimes(2);
  });

  test("abort aborts the in-flight signal without publishing an error", async () => {
    let captured: AbortSignal | undefined;
    compactor.compact.mockImplementationOnce((input) => {
      captured = input.signal;
      return new Promise<CompactionResult | null>((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const runner = makeRunner();
    const pending = runner.ensure(model);
    await flush();
    expect(captured?.aborted).toBe(false);
    runner.abort();
    expect(captured?.aborted).toBe(true);
    await pending;
    expect(envelopes("system.error")).toHaveLength(0);
  });

  test("a result that resolves after abort neither rewrites the conversation nor publishes", async () => {
    let release: ((result: CompactionResult | null) => void) | undefined;
    compactor.compact.mockReturnValueOnce(new Promise<CompactionResult | null>((resolve) => {
      release = resolve;
    }));
    const baseline = [...messages];
    const runner = makeRunner();
    const pending = runner.ensure(model);
    await flush();
    runner.abort();
    release!({
      summaryMessage: createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z"),
      firstKeptIndex: 1,
      tokensBefore: 500,
      summarizedPrefix: [messages[0]!],
    });
    await pending;
    expect(messages).toEqual(baseline);
    expect(envelopes("agent.compacted")).toHaveLength(0);
  });

  test("a failed compaction publishes system.error and leaves the conversation untouched", async () => {
    compactor.compact.mockRejectedValueOnce(new Error("boom"));
    const baseline = [...messages];
    await makeRunner().ensure(model);
    const errors = envelopes("system.error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.payload).toEqual({ error: "compaction failed: boom" });
    expect(messages).toEqual(baseline);
  });
});
