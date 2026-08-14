import type { AgentDispatcher, ArtifactStore, QuestionItem } from "../types";
import { JiePlatformError } from "../jie-platform-errors";
import type { ExecutionContext } from "./types";
import { createAskUserQuestionsTool } from "./ask-user-questions";
import type { QuestionBroker, QuestionResult } from "./ask-user-questions-broker";

const BASE_QUESTIONS: QuestionItem[] = [
  {
    question: "Which approach?",
    header: "Approach",
    options: [
      { label: "A", description: "approach a" },
      { label: "B", description: "approach b" },
    ],
    multiSelect: false,
  },
];

function stubArtifactStore(): ArtifactStore {
  return {
    write: async () => {
      throw new Error("stub: not implemented");
    },
    read: async () => {
      throw new Error("stub: not implemented");
    },
    list: async () => [],
  };
}

function stubAgentDispatcher(): AgentDispatcher {
  return {
    call: () => ({ agentKey: "", callbackTopic: "", callId: "", queued: false }),
  };
}

function makeCtx(): ExecutionContext {
  return {
    sessionId: "sess-1",
    teamId: "t1",
    agentKey: "a1",
    agentRole: "leader",
    artifactStore: stubArtifactStore(),
    toolArgs: new Map(),
    agentDispatcher: stubAgentDispatcher(),
  };
}

interface FakeBroker {
  broker: QuestionBroker;
  answered: Array<{ requestId: string; cancelled: boolean; answers: QuestionResult["answers"] }>;
}

function makeFakeBroker(): FakeBroker {
  const pending = new Map<string, (result: QuestionResult) => void>();
  const answered: FakeBroker["answered"] = [];
  return {
    broker: {
      ask: (request, signal?) => new Promise<QuestionResult>((resolve) => {
        if (signal?.aborted) throw new JiePlatformError("QUESTION_CANCELLED", { detail: "aborted" });
        pending.set("req-1", resolve);
      }),
      answer: (requestId, result) => {
        answered.push({ requestId, cancelled: result.cancelled, answers: result.answers });
        const resolve = pending.get(requestId);
        if (resolve !== undefined) resolve({ requestId, ...result });
      },
    },
    answered,
  };
}

describe("ask_user_questions", () => {
  test("returns a human-readable answer summary", async () => {
    const fake = makeFakeBroker();
    const tool = createAskUserQuestionsTool({ questionBroker: fake.broker });
    const promise = tool.execute({ questions: BASE_QUESTIONS }, makeCtx());
    fake.broker.answer("req-1", { cancelled: false, answers: [{ header: "Approach", selected: ["A"], other: null }] });
    const result = await promise;
    expect(result.content).toBe("The user answered:\n- Approach: A");
  });

  test("returns a cancellation message", async () => {
    const fake = makeFakeBroker();
    const tool = createAskUserQuestionsTool({ questionBroker: fake.broker });
    const promise = tool.execute({ questions: BASE_QUESTIONS }, makeCtx());
    fake.broker.answer("req-1", { cancelled: true, answers: null });
    const result = await promise;
    expect(result.content).toBe("The user declined to answer.");
  });

  test("rejects empty questions", async () => {
    const tool = createAskUserQuestionsTool({ questionBroker: makeFakeBroker().broker });
    await expect(tool.execute({ questions: [] }, makeCtx())).rejects.toMatchObject({ code: "QUESTION_INVALID" });
  });

  test("rejects a question with no options", async () => {
    const tool = createAskUserQuestionsTool({ questionBroker: makeFakeBroker().broker });
    await expect(tool.execute({ questions: [{ question: "x", header: "X", options: [], multiSelect: false }] }, makeCtx())).rejects.toMatchObject({ code: "QUESTION_INVALID" });
  });

  test("rejects too many questions", async () => {
    const questions = Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, header: `H${i}`, options: [{ label: "ok", description: "d" }], multiSelect: false }));
    const tool = createAskUserQuestionsTool({ questionBroker: makeFakeBroker().broker });
    await expect(tool.execute({ questions }, makeCtx())).rejects.toMatchObject({ code: "QUESTION_INVALID" });
  });

  test("rejects duplicate headers", async () => {
    const tool = createAskUserQuestionsTool({ questionBroker: makeFakeBroker().broker });
    await expect(tool.execute({ questions: [
      { question: "q1", header: "Same", options: [{ label: "a", description: "d" }], multiSelect: false },
      { question: "q2", header: "Same", options: [{ label: "b", description: "d" }], multiSelect: false },
    ] }, makeCtx())).rejects.toMatchObject({ code: "QUESTION_INVALID" });
  });
});
