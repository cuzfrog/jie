import { loadFixture, replayEnvelopes } from "./harness";

describe("T1 — simple agent", () => {
  test("replay: team loads, prompt streams, idle closes; rail hidden by default", async () => {
    const envelopes = await loadFixture("t1");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
    expect(state.showTeamRailPanel).toBe(false);
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.some((b) => b.text.includes("Once upon a time"))).toBe(true);
    expect(agent?.currentTurn?.userPrompt).toContain("Tell me a story");
    expect(agent?.status).toBe("idle");
  });

  test("rail hidden state is observable from getState", async () => {
    const envelopes = await loadFixture("t1");
    const { tui } = replayEnvelopes(envelopes);
    expect(tui.getState().showTeamRailPanel).toBe(false);
  });
});
