import {
  createCompactionSummaryMessage,
  estimateTokens,
  type AgentMessage,
  type CompactionSummaryMessage,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, ToolResultMessage, Usage } from "@earendil-works/pi-ai";
import { CompactorImpl, type CompactionInput } from "./compaction";
import type { Settings } from "../config";
import type { LlmService } from "../llm";
import type { TranscriptStore } from "../storage";

const BIG = "x".repeat(100_000);
const HUGE = "y".repeat(200_000);
const THRESHOLD_WINDOW = 30_000;
const RESERVE_30K = Math.min(24_000, Math.floor(THRESHOLD_WINDOW * 0.2));
const BUDGET_30K = THRESHOLD_WINDOW - RESERVE_30K;
const SUMMARY_MAX_30K = Math.floor(0.8 * RESERVE_30K);
const RESERVE_20K = Math.min(24_000, Math.floor(20_000 * 0.2));
const BUDGET_20K = 20_000 - RESERVE_20K;
const SUMMARY_MAX_20K = Math.floor(0.8 * RESERVE_20K);

type CompactionOverrides = NonNullable<Settings["compaction"]>;

const llmService = vi.mocked<LlmService>({ complete: vi.fn() });

function makeTranscriptStore() {
  return vi.mocked<TranscriptStore>({
    persist: vi.fn(),
    compact: vi.fn(),
    restore: vi.fn(async () => []),
    restoreDisplay: vi.fn(async () => []),
    hasSession: vi.fn(() => false),
    listSessions: vi.fn(() => []),
    listAgentKeys: vi.fn(() => []),
    remove: vi.fn(),
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

function customMsg(text: string, timestamp = 0): AgentMessage {
  return { role: "custom", customType: "note", content: text, display: true, timestamp };
}

function summaryMsg(text: string, timestamp: number): CompactionSummaryMessage {
  return createCompactionSummaryMessage(text, 1000, new Date(timestamp).toISOString());
}

function makeInput(messages: ReadonlyArray<AgentMessage>, model?: Model<Api>): CompactionInput {
  return {
    messages,
    contextWindow: (model ?? makeModel(THRESHOLD_WINDOW, 8192)).contextWindow,
    model: model ?? makeModel(THRESHOLD_WINDOW, 8192),
    agentKey: "worker-1",
    sessionId: "s1",
    teamId: "t1",
  };
}

function makeCompactor(
  transcriptStore: TranscriptStore,
  getSettings?: () => CompactionOverrides | undefined,
): CompactorImpl {
  return new CompactorImpl({ transcriptStore, llmService, getSettings });
}

beforeEach(() => {
  llmService.complete.mockResolvedValue("the-summary");
});

describe("CompactorImpl.compact", () => {
  test("returns null below the threshold without calling complete or transcriptStore", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const result = await compactor.compact(makeInput([userMsg("hello"), assistantMsg("hi")]));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("compacts earlier when a smaller contextWindow is provided", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const model = makeModel(THRESHOLD_WINDOW, 8192);
    const result = await compactor.compact({ ...makeInput(messages, model), contextWindow: 20_000 });
    expect(result).not.toBeNull();
    expect(result!.tokensBefore).toBeGreaterThan(BUDGET_20K);
  });

  test("compacts when the estimate exceeds the threshold", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const input = makeInput(messages, makeModel(20_000, 8192));
    const result = await compactor.compact(input);
    expect(result).not.toBeNull();
    expect(result?.firstKeptIndex).toBe(1);
    expect(result?.tokensBefore).toBeGreaterThan(BUDGET_20K);
    expect(result?.summarizedPrefix).toEqual([userMsg("please do the thing")]);
    expect(llmService.complete).toHaveBeenCalledTimes(1);
    const call = llmService.complete.mock.calls[0]![0];
    expect(call.model).toBe(input.model);
    expect(call.systemPrompt).toContain("context summarization assistant");
    expect(call.prompt).toContain("<conversation>");
    expect(call.prompt).toContain("please do the thing");
    expect(call.prompt).not.toContain(BIG.slice(0, 100));
    expect(call.prompt).toContain("structured context checkpoint summary");
    expect(call.prompt).not.toContain("<previous-summary>");
    expect(transcriptStore.compact).toHaveBeenCalledTimes(1);
    const [count, summary, agentKey, sessionId, teamId] = transcriptStore.compact.mock.calls[0]!;
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
    const transcriptStore = makeTranscriptStore();
    llmService.complete.mockImplementation(async () => {
      expect(transcriptStore.compact).not.toHaveBeenCalled();
      return "the-summary";
    });
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    await compactor.compact(makeInput(messages, makeModel(20_000, 8192)));
    expect(transcriptStore.compact).toHaveBeenCalledTimes(1);
  });

  test("never cuts at a toolResult message", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg("please do the thing"), assistantMsg("calling tool"), toolResultMsg(BIG), userMsg("tail prompt")];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, makeModel(20_000, 8192)));
    expect(result?.firstKeptIndex).toBe(3);
    const call = llmService.complete.mock.calls[0]![0];
    expect(call.prompt).toContain("please do the thing");
    expect(call.prompt).toContain("calling tool");
    expect(call.prompt).toContain(BIG.slice(0, 100));
    expect(call.prompt).not.toContain("tail prompt");
  });

  test("returns null when the history is below keepRecentTokens", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const result = await compactor.compact(makeInput([userMsg("a".repeat(10_000)), assistantMsg("b".repeat(10_000))]));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("returns null when the prefix would contain only the previous summary", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const result = await compactor.compact(makeInput([summaryMsg("old summary", 5000), userMsg(BIG)]));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("returns null when a trailing toolResult alone exceeds keepRecentTokens", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const result = await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg("calling tool"), toolResultMsg(BIG)]));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("feeds the previous summary into the update prompt and consumes its row", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result?.firstKeptIndex).toBe(2);
    const call = llmService.complete.mock.calls[0]![0];
    expect(call.prompt).toContain("<previous-summary>");
    expect(call.prompt).toContain("old summary");
    expect(call.prompt).toContain("NEW conversation messages");
    expect(call.prompt).toContain("<conversation>");
    expect(transcriptStore.compact).toHaveBeenCalledTimes(1);
    expect(transcriptStore.compact.mock.calls[0]![0]).toBe(2);
  });

  test("ignores stale usage recorded before the last summary", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const staleUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 5000), userMsg(BIG), assistantMsg("ok", 1000, staleUsage)];
    const result = await compactor.compact(makeInput(messages, model));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("uses fresh usage recorded after the last summary", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const freshUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG, 6000, freshUsage)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, model));
    expect(result?.firstKeptIndex).toBe(2);
    expect(result?.tokensBefore).toBeGreaterThan(200_000 * 0.8);
  });

  test("caps summary maxTokens at the model limit", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 1024)));
    expect(llmService.complete.mock.calls[0]![0].maxTokens).toBe(1024);
  });

  test("uses 0.8 of reserveTokens when the model allows more", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 100_000)));
    expect(llmService.complete.mock.calls[0]![0].maxTokens).toBe(SUMMARY_MAX_20K);
  });

  test("propagates the abort signal to complete", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const controller = new AbortController();
    await compactor.compact({
      ...makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 8192)),
      signal: controller.signal,
    });
    expect(llmService.complete.mock.calls[0]![0].signal).toBe(controller.signal);
  });

  test("rejects when complete fails and does not persist", async () => {
    const transcriptStore = makeTranscriptStore();
    llmService.complete.mockRejectedValue(new Error("summarization failed"));
    const compactor = makeCompactor(transcriptStore);
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const input = makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 8192));
    await expect(compactor.compact(input)).rejects.toThrow("summarization failed");
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("rejects when the stored history diverges from the in-memory messages", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    transcriptStore.restore.mockResolvedValue([userMsg("only one stored row")]);
    const input = makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 8192));
    await expect(compactor.compact(input)).rejects.toThrow("out of sync");
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("skips compaction when the overrides disable it", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore, () => ({ enabled: false }));
    const result = await compactor.compact(makeInput([userMsg("please do the thing"), assistantMsg(BIG)]));
    expect(result).toBeNull();
    expect(llmService.complete).not.toHaveBeenCalled();
    expect(transcriptStore.restore).not.toHaveBeenCalled();
    expect(transcriptStore.compact).not.toHaveBeenCalled();
  });

  test("applies the reserveTokens override while keepRecentTokens falls back to the default", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore, () => ({ reserveTokens: 32768 }));
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const result = await compactor.compact(
      makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(THRESHOLD_WINDOW, 100_000)),
    );
    expect(llmService.complete.mock.calls[0]![0].maxTokens).toBe(Math.floor(0.8 * 32768));
    expect(result?.firstKeptIndex).toBe(1);
  });

  test("applies the keepRecentTokens override to the cut point", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore, () => ({ keepRecentTokens: 1 }));
    const messages = [userMsg("please do the thing"), assistantMsg(BIG), userMsg("tail prompt")];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, makeModel(20_000, 8192)));
    expect(result?.firstKeptIndex).toBe(2);
    const call = llmService.complete.mock.calls[0]![0];
    expect(call.prompt).toContain(BIG.slice(0, 100));
    expect(call.prompt).not.toContain("tail prompt");
  });

  test("falls back to the defaults for absent overrides", async () => {
    const transcriptStore = makeTranscriptStore();
    transcriptStore.restore.mockResolvedValue([userMsg("a"), assistantMsg("b")]);
    const input = makeInput([userMsg("please do the thing"), assistantMsg(BIG)], makeModel(20_000, 100_000));
    await makeCompactor(transcriptStore, () => undefined).compact(input);
    await makeCompactor(transcriptStore, () => ({})).compact(input);
    expect(llmService.complete.mock.calls[0]![0].maxTokens).toBe(SUMMARY_MAX_20K);
    expect(llmService.complete.mock.calls[1]![0].maxTokens).toBe(SUMMARY_MAX_20K);
  });

  test("reads the overrides at each compact call", async () => {
    const transcriptStore = makeTranscriptStore();
    let overrides: CompactionOverrides | undefined = { enabled: false };
    const compactor = makeCompactor(transcriptStore, () => overrides);
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    expect(await compactor.compact(makeInput(messages, makeModel(20_000, 8192)))).toBeNull();
    overrides = undefined;
    expect(await compactor.compact(makeInput(messages, makeModel(20_000, 8192)))).not.toBeNull();
    expect(llmService.complete).toHaveBeenCalledTimes(1);
  });

  test("caps the summarized prefix so an oversized prefix message cannot overflow the summarization call", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore, () => ({ keepRecentTokens: 2 }));
    const messages = [userMsg(HUGE, 0), assistantMsg("a", 1000), userMsg("b", 2000), assistantMsg("c", 3000)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages));
    expect(result?.firstKeptIndex).toBe(2);
    expect(llmService.complete).toHaveBeenCalledTimes(1);
    const call = llmService.complete.mock.calls[0]![0];
    expect(call.maxTokens).toBe(SUMMARY_MAX_30K);
    expect(call.prompt).toContain("[content truncated to fit the context window]");
    expect(call.prompt).not.toContain(HUGE);
  });

  test("summarizes an oversized earlier turn and keeps only the small assistant tail in a 60k window", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const first = "a".repeat(16_000);
    const huge = "x".repeat(204_000);
    const tail = "ok";
    const messages = [userMsg(first), userMsg(huge), assistantMsg(tail)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const model = makeModel(60_000, 8192);
    const result = await compactor.compact(makeInput(messages, model));
    expect(result).not.toBeNull();
    expect(result!.firstKeptIndex).toBe(2);
    const prompt = llmService.complete.mock.calls[0]![0]!.prompt;
    expect(prompt).toContain("[content truncated to fit the context window]");
    expect(prompt).not.toContain(tail);
  });

  test("scales reserveTokens to 20% of the window capped at 24k by default", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg(HUGE), assistantMsg(HUGE)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, makeModel(60_000, 20_000)));
    expect(result).not.toBeNull();
    expect(llmService.complete.mock.calls[0]![0].maxTokens).toBe(Math.floor(0.8 * Math.min(24_000, 60_000 * 0.2)));
  });

  test("caps reserveTokens at 24k on large windows", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [userMsg(HUGE), assistantMsg(HUGE)];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, makeModel(120_000, 50_000)));
    expect(result).not.toBeNull();
    expect(llmService.complete.mock.calls[llmService.complete.mock.calls.length - 1][0].maxTokens).toBe(Math.floor(0.8 * 24_000));
  });

  test("keeps at most a fixed 8k tail on a large window by default", async () => {
    const transcriptStore = makeTranscriptStore();
    const compactor = makeCompactor(transcriptStore);
    const messages = [
      userMsg("x".repeat(1_000)),
      assistantMsg("x".repeat(600_000)),
      userMsg("x".repeat(1_000)),
      assistantMsg("calling tool"),
      toolResultMsg("x".repeat(120_000)),
      userMsg("x".repeat(40_000)),
      assistantMsg("done"),
    ];
    transcriptStore.restore.mockResolvedValue([...messages]);
    const result = await compactor.compact(makeInput(messages, makeModel(200_000, 8192)));
    expect(result).not.toBeNull();
    expect(result!.firstKeptIndex).toBe(6);
  });
});

describe("CompactorImpl.contextTokens", () => {
  test("estimates from message content when the only usage predates the last summary", () => {
    const staleUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [summaryMsg("old summary", 5000), userMsg(BIG), assistantMsg("ok", 1000, staleUsage)];
    expect(compactor.contextTokens(messages)).toBeLessThan(1_000_000);
    expect(compactor.contextTokens(messages)).toBe(3 + 25_000 + 1);
  });

  test("uses provider usage when it was recorded after the last summary", () => {
    const freshUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG, 6000, freshUsage)];
    expect(compactor.contextTokens(messages)).toBeGreaterThan(1_000_000);
  });

  test("adds overheadTokens to the message-estimate fallback", () => {
    const staleUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [summaryMsg("summary", 5000), userMsg(BIG), assistantMsg("ok", 1000, staleUsage)];
    const expected = messages.reduce((sum, message) => sum + estimateTokens(message), 0) + 500;
    expect(compactor.contextTokens(messages, 500)).toBe(expected);
  });

  test("does not double-count overheadTokens when an anchored usage is available", () => {
    const freshUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [userMsg(BIG), assistantMsg("ok", 1000, freshUsage)];
    expect(compactor.contextTokens(messages, 500)).toBe(1_900_000);
  });
});

describe("CompactorImpl.needsCompaction", () => {
  test("returns false below the threshold", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    expect(compactor.needsCompaction([userMsg("hello"), assistantMsg("hi")], THRESHOLD_WINDOW)).toBe(false);
  });

  test("returns true when the estimate exceeds the threshold", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [userMsg("please do the thing"), assistantMsg(HUGE)];
    expect(compactor.needsCompaction(messages, THRESHOLD_WINDOW)).toBe(true);
  });

  test("returns false when compaction is disabled", () => {
    const compactor = makeCompactor(makeTranscriptStore(), () => ({ enabled: false }));
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    expect(compactor.needsCompaction(messages, THRESHOLD_WINDOW)).toBe(false);
  });

  test("honors a smaller contextWindow than the model default", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [userMsg("please do the thing"), assistantMsg(BIG)];
    expect(compactor.needsCompaction(messages, 20_000)).toBe(true);
  });

  test("ignores stale usage recorded before the last summary", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const staleUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 5000), userMsg(BIG), assistantMsg("ok", 1000, staleUsage)];
    expect(compactor.needsCompaction(messages, model.contextWindow)).toBe(false);
  });

  test("uses fresh usage recorded after the last summary", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const freshUsage: Usage = { input: 1_900_000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1_900_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const model = makeModel(200_000, 8192);
    const messages = [summaryMsg("old summary", 1000), userMsg(BIG), assistantMsg(BIG, 6000, freshUsage)];
    expect(compactor.needsCompaction(messages, model.contextWindow)).toBe(true);
  });

  test("triggers earlier when overheadTokens is present", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [userMsg("please do the thing"), assistantMsg("x".repeat(90_000))];
    expect(compactor.needsCompaction(messages, THRESHOLD_WINDOW)).toBe(false);
    expect(compactor.needsCompaction(messages, THRESHOLD_WINDOW, 3000)).toBe(true);
  });
});

describe("CompactorImpl.fitToWindow", () => {
  const MARKER = "[content truncated to fit the context window]";

  function totalTokens(messages: ReadonlyArray<AgentMessage>): number {
    return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
  }

  test("returns the same array when the history fits the budget", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages = [userMsg("hello"), assistantMsg("hi")];
    expect(compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192))).toBe(messages);
  });

  test("honors a custom contextWindow smaller than the model window", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages: AgentMessage[] = [userMsg(HUGE), assistantMsg("small tail")];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192), 20_000);
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_20K);
  });

  test("truncates the largest message until the total fits the budget", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages: AgentMessage[] = [userMsg(HUGE), assistantMsg("small tail")];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192));
    expect(result).not.toBe(messages);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(messages[1]);
    const truncated = result[0];
    if (truncated === undefined || truncated.role !== "user" || typeof truncated.content !== "string") {
      throw new Error("expected a user message with string content");
    }
    expect(truncated.content.startsWith(HUGE.slice(0, 1000))).toBe(true);
    expect(truncated.content.endsWith(MARKER)).toBe(true);
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_30K);
    expect(messages[0]).toEqual(userMsg(HUGE));
  });

  test("truncates text and thinking blocks but leaves toolCall blocks untouched", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const toolCall = { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } } as const;
    const heavyAssistant: AssistantMessage = {
      ...assistantMsg("small"),
      content: [{ type: "thinking", thinking: BIG }, { type: "text", text: BIG }, toolCall],
    };
    const messages: AgentMessage[] = [heavyAssistant, toolResultMsg(BIG)];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192));
    const assistant = result[0];
    if (assistant === undefined || assistant.role !== "assistant") throw new Error("expected an assistant message");
    expect(assistant.content).toHaveLength(3);
    expect(assistant.content[2]).toEqual(toolCall);
    const blocks = assistant.content;
    for (const block of blocks.slice(0, 2)) {
      const text = block.type === "thinking" ? block.thinking : block.type === "text" ? block.text : "";
      expect(text.endsWith(MARKER)).toBe(true);
    }
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_30K);
    expect(heavyAssistant.content).toHaveLength(3);
    if (heavyAssistant.content[1]!.type !== "text") throw new Error("expected a text block");
    expect(heavyAssistant.content[1]!.text).toBe(BIG);
  });

  test("truncates the summary field of a compactionSummary message", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages: AgentMessage[] = [summaryMsg(HUGE, 1000), userMsg("tail")];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192));
    const summary = result[0];
    if (summary === undefined || summary.role !== "compactionSummary") throw new Error("expected a summary message");
    expect(summary.summary.endsWith(MARKER)).toBe(true);
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_30K);
  });

  test("truncates a custom message with string content", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages: AgentMessage[] = [customMsg(HUGE), userMsg("tail")];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192));
    const custom = result[0];
    if (custom === undefined || custom.role !== "custom" || typeof custom.content !== "string") {
      throw new Error("expected a custom message with string content");
    }
    expect(custom.content.startsWith(HUGE.slice(0, 1000))).toBe(true);
    expect(custom.content.endsWith(MARKER)).toBe(true);
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_30K);
  });

  test("passes through a message with nothing shrinkable", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const toolCall = { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } } as const;
    const toolCallOnly: AgentMessage = { ...assistantMsg("small"), content: [toolCall] };
    const result = compactor.fitToWindow([toolCallOnly, userMsg(HUGE)], makeModel(THRESHOLD_WINDOW, 8192));
    expect(result[0]).toBe(toolCallOnly);
    expect(result[1]).not.toEqual(userMsg(HUGE));
  });

  test("applies the reserveTokens override to the budget", () => {
    const compactor = makeCompactor(makeTranscriptStore(), () => ({ reserveTokens: 29000 }));
    const result = compactor.fitToWindow([userMsg(HUGE)], makeModel(THRESHOLD_WINDOW, 8192));
    expect(result).toHaveLength(1);
    expect(totalTokens(result)).toBeLessThanOrEqual(THRESHOLD_WINDOW - 29000);
  });

  test("clamps the budget to zero when reserveTokens reaches the window", () => {
    const compactor = makeCompactor(makeTranscriptStore(), () => ({ reserveTokens: 40000 }));
    const result = compactor.fitToWindow([userMsg(HUGE)], makeModel(THRESHOLD_WINDOW, 8192));
    expect(result).toHaveLength(1);
    expect(totalTokens(result)).toBeLessThanOrEqual(THRESHOLD_WINDOW);
    expect(result[0]).not.toEqual(userMsg(HUGE));
  });

  test("subtracts overheadTokens from the available budget", () => {
    const compactor = makeCompactor(makeTranscriptStore());
    const messages: AgentMessage[] = [userMsg(HUGE), assistantMsg("tail")];
    const result = compactor.fitToWindow(messages, makeModel(THRESHOLD_WINDOW, 8192), THRESHOLD_WINDOW, 5000);
    expect(totalTokens(result)).toBeLessThanOrEqual(BUDGET_30K - 5000);
  });
});