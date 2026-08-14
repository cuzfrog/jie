import type { EventEnvelope, EventManager, EventType } from "../event";
import type { QuestionItem } from "../types";
import { InProcessQuestionBroker } from "./ask-user-questions-broker";

const SAMPLE_QUESTIONS: ReadonlyArray<QuestionItem> = [
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

function makeFakeEventManager(): EventManager {
  const subscribers = new Map<string, Array<(env: EventEnvelope<EventType>) => void>>();
  return {
    publish: (env: EventEnvelope<EventType>) => {
      for (const callback of subscribers.get(env.topic) ?? []) callback(env);
    },
    subscribe: (topic: string, callback: (env: EventEnvelope<EventType>) => void) => {
      const list = subscribers.get(topic) ?? [];
      list.push(callback);
      subscribers.set(topic, list);
      return () => {
        subscribers.set(topic, list.filter((cb) => cb !== callback));
      };
    },
  };
}

function makeBroker(generateId: () => string = () => "req-1"): { broker: InProcessQuestionBroker; events: EventManager; published: EventEnvelope<"agent.question.ask">[] } {
  const events = makeFakeEventManager();
  const published: EventEnvelope<"agent.question.ask">[] = [];
  events.subscribe("agent.question.ask", (env) => {
    if (env.type === "agent.question.ask") published.push(env as EventEnvelope<"agent.question.ask">);
  });
  return { broker: new InProcessQuestionBroker(events, generateId), events, published };
}

describe("InProcessQuestionBroker", () => {
  test("ask publishes agent.question.ask and returns a pending promise", async () => {
    const { broker, published } = makeBroker();
    const promise = broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS });
    expect(published).toHaveLength(1);
    const [env] = published;
    expect(env.type).toBe("agent.question.ask");
    expect(env.payload).toMatchObject({ requestId: "req-1", questions: SAMPLE_QUESTIONS });
    expect(env.sender).toEqual({ kind: "agent", teamId: "t1", agentKey: "a1" });
    broker.answer("req-1", { cancelled: false, answers: [{ header: "Approach", selected: ["A"], other: null }] });
    await expect(promise).resolves.toBeInstanceOf(Object);
  });

  test("answer resolves the pending promise with requestId and answers", async () => {
    const { broker } = makeBroker();
    const promise = broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS });
    broker.answer("req-1", {
      cancelled: false,
      answers: [{ header: "Approach", selected: ["A"], other: null }],
    });
    const result = await promise;
    expect(result.requestId).toBe("req-1");
    expect(result.cancelled).toBe(false);
    expect(result.answers).toEqual([{ header: "Approach", selected: ["A"], other: null }]);
  });

  test("answer for an unknown requestId throws QUESTION_NOT_FOUND", () => {
    const { broker } = makeBroker();
    expect(() => broker.answer("missing", { cancelled: true, answers: null })).toThrow(expect.objectContaining({ code: "QUESTION_NOT_FOUND" }));
  });

  test("ask rejects when the abort signal is already aborted", async () => {
    const { broker } = makeBroker();
    const controller = new AbortController();
    controller.abort();
    await expect(broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS }, controller.signal)).rejects.toMatchObject({ code: "QUESTION_CANCELLED" });
  });

  test("ask rejects when the abort signal fires later", async () => {
    const { broker } = makeBroker();
    const controller = new AbortController();
    const promise = broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "QUESTION_CANCELLED" });
  });

  test("each ask generates a unique requestId", async () => {
    let counter = 0;
    const { broker, published } = makeBroker(() => `req-${++counter}`);
    const p1 = broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS });
    const p2 = broker.ask({ teamId: "t1", agentKey: "a1", questions: SAMPLE_QUESTIONS });
    broker.answer("req-1", { cancelled: false, answers: [{ header: "Approach", selected: ["A"], other: null }] });
    broker.answer("req-2", { cancelled: false, answers: [{ header: "Approach", selected: ["B"], other: null }] });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.requestId).toBe("req-1");
    expect(r2.requestId).toBe("req-2");
    expect(published[0].payload.requestId).toBe("req-1");
    expect(published[1].payload.requestId).toBe("req-2");
  });
});
