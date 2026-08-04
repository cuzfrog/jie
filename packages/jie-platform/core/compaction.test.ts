import { createCompactionSummaryMessage, type AgentMessage, type CompactionSummaryMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, ToolResultMessage, Usage } from "@earendil-works/pi-ai";
import { CompactorImpl, type CompactionInput } from "./compaction";
import type { Settings } from "../config";
import type { MemoryManager } from "../storage";

const BIG = "x".repeat(100_000);
const THRESHOLD_WINDOW = 30_000;

type CompactionOverrides = NonNullable<Settings["compaction"]>;

interface SummarizeCall {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly model: Model<Api>;
  readonly apiKey: string | undefined;
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
}

function makeMemory() {
  return vi.mocked<MemoryManager>({
    persist: vi.fn(),
    compact: vi.fn(),
    restore: vi.fn(async () => []),
    hasSession: vi.fn(() => false),
    listSessions: vi.fn(() => []),
    sessionName: vi.fn(() => null),
    renameSession: vi.fn(),
  });
}

function makeModel(contextWindow: number, maxTokens: number): Model<Api> {
  return {
    id: "m",
    name: "m",
    api: "openai-completions" as Api,
    provider: "e2e",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
  };
}

function userMsg(text: string, timestamp = 0): AgentMessage {
  return { role: "user", content: text, timestamp };
}

function assistantMsg(text: string, timestamp = 0, usage?: Usage): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions" as Api,
    provider: "e2e",
    model: "m",
    usage: usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp,
  };
}

function toolResultMsg(text: string, timestamp = 0): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "call_1",
    toolName: "bash",
    content: [{ type: "text", text }],
    isError: false,
    timestamp,
  };
}

function summaryMsg(text: string, timestamp: number): CompactionSummaryMessage {
  return createCompactionSummaryMessage(text, 1000, new Date(timestamp).toISOString());
}

function makeInput(messages: ReadonlyArray<AgentMessage>, model?: Model<Api>): CompactionInput {
  return {
    messages,
    contextWindow: (model ?? makeModel(THRESHOLD_WINDOW, 8192)).contextWindow,
    model: model ?? makeModel(THRESHOLD_WINDOW, 8192),
    apiKey: "key-1",
    agentKey: "worker-1",
    sessionId: "s1",
    teamId: "t1",
  };
}

function makeCompactor(
  memory: MemoryManager,
  summarize: (input: SummarizeCall) => Promise<string>,
  getSettings?: () => CompactionOverrides | undefined,
): CompactorImpl {
  return new CompactorImpl({ memory, summarize, getSettings });
}

describe("CompactorImpl.compact", () => {
  test("returns null below the threshold without calling summarize or memory", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    const result = await compactor.compact(makeInput([userMsg("hello"), assistantMsg("hi")]));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("compacts when the estimate exceeds the threshold", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    memory.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result).not.toBeNull();
    expect(result?.firstKeptIndex).toBe(1);
    expect(result?.tokensBefore).toBeGreaterThan(THRESHOLD_WINDOW - 16384);
    expect(summarize).toHaveBeenCalledTimes(1);
    const call = summarize.mock.calls[0]![0];
    expect(call.systemPrompt).toContain("context summarization assistant");
    expect(call.userPrompt).toContain("<conversation>");
    expect(call.userPrompt).toContain("please do the thing");
    expect(call.userPrompt).not.toContain(BIG.slice(0, 100));
    expect(call.userPrompt).toContain("structured context checkpoint summary");
    expect(call.userPrompt).not.toContain("<previous-summary>");
    expect(call.apiKey).toBe("key-1");
    expect(memory.compact).toHaveBeenCalledTimes(1);
    const [count, summary, agentKey, sessionId, teamId] = memory.compact.mock.calls[0]!;
    expect(count).toBe(1);
    expect(agentKey).toBe("worker-1");
    expect(sessionId).toBe("s1");
    expect(teamId).toBe("t1");
    if (summary.role !== "compactionSummary") throw new Error("expected a compactionSummary message");
    expect(summary.summary).toBe("the-summary");
    expect(summary.tokensBefore).toBe(result!.tokensBefore);
    expect(result?.summaryMessage).toBe(summary);
  });

  test("summarizes before persisting", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => {
      expect(memory.compact).not.toHaveBeenCalled();
      return "the-summary";
    });
    const compactor = makeCompactor(memory, summarize);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    memory.restore.mockResolvedValue([...messages]);
    await compactor.compact(makeInput(messages));
    expect(memory.compact).toHaveBeenCalledTimes(1);
  });

  test("never cuts at a toolResult message", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    const messages = [userMsg("please do the thing"), assistantMsg("calling tool"), toolResultMsg(BIG), userMsg("tail prompt")];
    memory.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result?.firstKeptIndex).toBe(3);
    const call = summarize.mock.calls[0]![0];
    expect(call.userPrompt).toContain("please do the thing");
    expect(call.userPrompt).toContain("calling tool");
    expect(call.userPrompt).toContain(BIG.slice(0, 100));
    expect(call.userPrompt).not.toContain("tail prompt");
  });

  test("returns null when the history is below keepRecentTokens", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    const result = await compactor.compact(makeInput([userMsg("a".repeat(10_000)), assistantMsg("b".repeat(10_000))]));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("returns null when the prefix would contain only the previous summary", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    const result = await compactor.compact(makeInput([summaryMsg("old summary", 5000), userMsg(BIG)]));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("returns null when a trailing toolResult alone exceeds keepRecentTokens", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    const result = await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg("calling tool"), toolResultMsg(BIG)]));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });

  test("feeds the previous summary into the update prompt and consumes its row", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary-2");
    const compactor = makeCompactor(memory, summarize);
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG)];
    memory.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result?.firstKeptIndex).toBe(2);
    const call = summarize.mock.calls[0]![0];
    expect(call.userPrompt).toContain("<previous-summary>");
    expect(call.userPrompt).toContain("old summary");
    expect(call.userPrompt).toContain("NEW conversation messages");
    expect(call.userPrompt).toContain("<conversation>");
    expect(memory.compact).toHaveBeenCalledTimes(1);
    expect(memory.compact.mock.calls[0]![0]).toBe(2);
  });

  test("ignores stale usage recorded before the last summary", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    const staleUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 5000), userMsg(BIG), assistantMsg("ok", 1000, staleUsage)];
    const result = await compactor.compact(makeInput(messages, model));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });

  test("uses fresh usage recorded after the last summary", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    const freshUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG, 6000, freshUsage)];
    memory.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, model));
    expect(result?.firstKeptIndex).toBe(2);
    expect(result?.tokensBefore).toBeGreaterThan(200_000 - 16384);
  });

  test("caps summary maxTokens at the model limit", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(THRESHOLD_WINDOW, 1024)));
    expect(summarize.mock.calls[0]![0].maxTokens).toBe(1024);
  });

  test("uses 0.8 of reserveTokens when the model allows more", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(THRESHOLD_WINDOW, 100_000)));
    expect(summarize.mock.calls[0]![0].maxTokens).toBe(Math.floor(0.8 * 16384));
  });

  test("propagates the abort signal to summarize", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize);
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const controller = new AbortController();
    await compactor.compact({ ...makeInput([userMsg("please do the thing"), assistantMsg(BIG)]), signal: controller.signal });
    expect(summarize.mock.calls[0]![0].signal).toBe(controller.signal);
  });

  test("rejects when summarize fails and does not persist", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall): Promise<string> => {
      throw new Error("summarization failed");
    });
    const compactor = makeCompactor(memory, summarize);
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    await expect(compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)]))).rejects.toThrow("summarization failed");
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("rejects when the stored history diverges from the in-memory messages", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize);
    memory.restore.mockResolvedValue([userMsg("only one stored row")]);
    await expect(compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)]))).rejects.toThrow("out of sync");
    expect(summarize).not.toHaveBeenCalled();
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("skips compaction when the overrides disable it", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "summary");
    const compactor = makeCompactor(memory, summarize, () => ({ enabled: false }));
    const result = await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)]));
    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(memory.compact).not.toHaveBeenCalled();
  });

  test("applies the reserveTokens override while keepRecentTokens falls back to the default", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize, () => ({ reserveTokens: 32768 }));
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const result = await compactor.compact(
      makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(THRESHOLD_WINDOW, 100_000)),
    );
    expect(summarize.mock.calls[0]![0].maxTokens).toBe(Math.floor(0.8 * 32768));
    expect(result?.firstKeptIndex).toBe(1);
  });

  test("applies the keepRecentTokens override to the cut point", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    const compactor = makeCompactor(memory, summarize, () => ({ keepRecentTokens: 1 }));
    const messages = [userMsg("please do the thing"), assistantMsg(BIG), userMsg("tail prompt")];
    memory.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result?.firstKeptIndex).toBe(2);
    const call = summarize.mock.calls[0]![0];
    expect(call.userPrompt).toContain(BIG.slice(0, 100));
    expect(call.userPrompt).not.toContain("tail prompt");
  });

  test("falls back to the defaults for absent overrides", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    memory.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const input = makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(THRESHOLD_WINDOW, 100_000));
    await makeCompactor(memory, summarize, () => undefined).compact(input);
    await makeCompactor(memory, summarize, () => ({})).compact(input);
    expect(summarize.mock.calls[0]![0].maxTokens).toBe(Math.floor(0.8 * 16384));
    expect(summarize.mock.calls[1]![0].maxTokens).toBe(Math.floor(0.8 * 16384));
  });

  test("reads the overrides at each compact call", async () => {
    const memory = makeMemory();
    const summarize = vi.fn(async (_input: SummarizeCall) => "the-summary");
    let overrides: CompactionOverrides | undefined = { enabled: false };
    const compactor = makeCompactor(memory, summarize, () => overrides);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    memory.restore.mockResolvedValue([...messages]);
    expect(await compactor.compact(makeInput(messages))).toBeNull();
    overrides = undefined;
    expect(await compactor.compact(makeInput(messages))).not.toBeNull();
    expect(summarize).toHaveBeenCalledTimes(1);
  });
});
