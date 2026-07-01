import { loadFixture, replayEnvelopes } from "./harness";

describe("T3 — switch teams", () => {
  test("initial team loads; first prompt streams", async () => {
    const envelopes = await loadFixture("t3");
    const { tui } = replayEnvelopes(envelopes.slice(0, 5));
    const state = tui.getState();
    expect(state.teamId).toBe("my-team-1");
    expect(state.agents.size).toBe(1);
    expect(state.agents.get("my-team-1:general-1")?.currentTurn?.blocks.some((b) => b.text.includes("3"))).toBe(true);
  });

  test("team swap to my-team-2 clears agents and re-seeds", async () => {
    const envelopes = await loadFixture("t3");
    const { tui } = replayEnvelopes(envelopes.slice(0, 9));
    const state = tui.getState();
    expect(state.teamId).toBe("my-team-2");
    expect(state.agents.size).toBe(1);
    expect(state.agents.has("my-team-1:general-1")).toBe(false);
    expect(state.agents.has("my-team-2:general-1")).toBe(true);
    expect(state.agents.get("my-team-2:general-1")?.currentTurn?.blocks.some((b) => b.text.includes("story"))).toBe(true);
  });

  test("team swap back to my-team-1 re-seeds from loaded data", async () => {
    const envelopes = await loadFixture("t3");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.teamId).toBe("my-team-1");
    expect(state.agents.size).toBe(1);
    expect(state.agents.has("my-team-1:general-1")).toBe(true);
  });
});
