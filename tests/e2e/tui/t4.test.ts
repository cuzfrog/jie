
import { loadFixture, replayEnvelopes } from "./harness";

describe("T4 — first-time setup (TUI flow)", () => {
  test("team loads, first prompt raises an error banner about missing model", async () => {
    const envelopes = await loadFixture("t4");
    const { tui } = replayEnvelopes(envelopes.slice(0, 3));
    const state = tui.getState();
    expect(state.errorBanner?.text).toBe("No model has been selected, please login and select a default model.");
  });

  test("error clears on the next user prompt and the response streams", async () => {
    const envelopes = await loadFixture("t4");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.errorBanner).toBeNull();
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.some((b) => b.text.includes("chicken"))).toBe(true);
  });
});
