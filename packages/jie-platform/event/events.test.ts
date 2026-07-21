import { Events, type AgentSender } from "./events";

const AGENT_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "general-1" };

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