import { Events, type AgentSender, type UserSender } from "./events";

const AGENT_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "general-1" };
const USER_SENDER: UserSender = { kind: "user" };

describe("Events.agentUsage", () => {
  test("builds an agent.usage envelope with the supplied usage payload", () => {
    const env = Events.agentUsage(AGENT_SENDER, {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      totalTokens: 165,
    });
    expect(env.type).toBe("agent.usage");
    expect(env.sender).toBe(AGENT_SENDER);
    expect(env.payload).toEqual({
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      totalTokens: 165,
    });
  });

  test("the envelope is frozen with version 1 and topic equal to type", () => {
    const env = Events.agentUsage(AGENT_SENDER, {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
    });
    expect(env.version).toBe(1);
    expect(env.topic).toBe("agent.usage");
  });
});

describe("Events.agentPromptQueueUpdate", () => {
  test("builds an agent.prompt.queue.update envelope carrying typed entries", () => {
    const prompts = [
      { text: "first", source: "user" },
      { text: "[qa-1 on 'task.recorded']: report", source: "peer" },
    ] as const;
    const env = Events.agentPromptQueueUpdate(AGENT_SENDER, [...prompts]);
    expect(env.type).toBe("agent.prompt.queue.update");
    expect(env.topic).toBe("agent.prompt.queue.update");
    expect(env.payload.prompts).toEqual([...prompts]);
  });
});

describe("Events.userPromptDequeue", () => {
  test("builds a user.prompt.dequeue envelope addressed to one agent", () => {
    const env = Events.userPromptDequeue(USER_SENDER, "my-team", "general-1", "queued text");
    expect(env.type).toBe("user.prompt.dequeue");
    expect(env.topic).toBe("user.prompt.dequeue");
    expect(env.sender).toBe(USER_SENDER);
    expect(env.payload).toEqual({ teamId: "my-team", agentKey: "general-1", prompt: "queued text" });
  });
});

describe("Events.userPromptRequeue", () => {
  test("builds a user.prompt.requeue envelope addressed to one agent", () => {
    const env = Events.userPromptRequeue(USER_SENDER, "my-team", "general-1", "dequeued text");
    expect(env.type).toBe("user.prompt.requeue");
    expect(env.topic).toBe("user.prompt.requeue");
    expect(env.sender).toBe(USER_SENDER);
    expect(env.payload).toEqual({ teamId: "my-team", agentKey: "general-1", prompt: "dequeued text" });
  });
});

describe("Events.userEffortUpdate", () => {
  test("builds a user.effort.update envelope carrying the effort level", () => {
    const env = Events.userEffortUpdate(USER_SENDER, "high");
    expect(env.type).toBe("user.effort.update");
    expect(env.topic).toBe("user.effort.update");
    expect(env.sender).toBe(USER_SENDER);
    expect(env.payload).toEqual({ effort: "high" });
  });
});
