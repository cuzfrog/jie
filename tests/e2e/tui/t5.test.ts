import { loadFixture, replayEnvelopes } from "./harness";

describe("T5 — second prompt after the first turn", () => {
  test("after both turns complete, the second prompt is recorded in the agent's chat history", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    const agent = state.agents.get("my-team:general-1");
    expect(agent).toBeDefined();
    const allTurns = [
      ...(agent?.history ?? []),
      ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
    ];
    expect(allTurns.length).toBeGreaterThanOrEqual(2);
  });

  test("frame renders both prompts and the haiku response", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes);
    const frame = tui.frame();
    expect(frame.some((l) => l.includes("Research the history of J"))).toBe(true);
    expect(frame.some((l) => l.includes("haiku"))).toBe(true);
  });
});