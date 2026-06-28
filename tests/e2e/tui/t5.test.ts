
import { loadFixture, replayEnvelopes } from "./harness";

describe("T5 — queued prompts", () => {
  test("while prompt 1 is busy, the queue indicator shows the queued prompt", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes.slice(0, 5));
    const state = tui.getState();
    expect(state.queue.length).toBe(1);
    expect(state.queue[0]).toContain("haiku");
  });

  test("after both turns complete, queue is empty and history has both turns", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.queue.length).toBe(0);
    const agent = state.agents.get("my-team:general-1");
    expect(agent).toBeDefined();
    const allTurns = [...(agent?.history ?? []), ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : [])];
    expect(allTurns.length).toBeGreaterThanOrEqual(2);
  });

  test("frame shows the queue indicator with the haiku preview", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes.slice(0, 5));
    const frame = tui.frame();
    expect(frame.some((l) => l.includes("queued") && l.includes("haiku"))).toBe(true);
  });
});
