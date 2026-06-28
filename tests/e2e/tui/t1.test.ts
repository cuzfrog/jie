
import { loadFixture, replayEnvelopes } from "./harness";

describe("T1 — simple agent", () => {
  test("replay: team loads, prompt streams, idle closes; rail hidden by default", async () => {
    const envelopes = await loadFixture("t1");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
    expect(state.showRail).toBe(false);
    expect(state.agents.get("my-team:general-1")?.currentTurn?.blocks.some((b) => b.text.includes("Once upon a time"))).toBe(true);
    expect(state.agents.get("my-team:general-1")?.status).toBe("idle");
    const frame = tui.frame();
    expect(frame.some((l) => l.includes("Tell me a story"))).toBe(true);
    expect(frame.some((l) => l.includes("Once upon a time"))).toBe(true);
    expect(frame.some((l) => l.includes("my-team:general-1"))).toBe(true);
  });

  test("← ← toggles the rail; rail row shows the leader with ★", async () => {
    const envelopes = await loadFixture("t1");
    const { tui } = replayEnvelopes(envelopes);
    tui.injectKey("\x1b[D\x1b[D");
    expect(tui.getState().showRail).toBe(true);
    const frame = tui.frame();
    expect(frame.some((l) => l.includes("★") && l.includes("general"))).toBe(true);
  });
});