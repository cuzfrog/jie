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

  test("state captures both prompts and the haiku response", async () => {
    const envelopes = await loadFixture("t5");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    const agent = state.agents.get("my-team:general-1");
    const allTurns = [
      ...(agent?.history ?? []),
      ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
    ];
    const allPrompts = allTurns.map((t) => t.userPrompt).join("\n");
    expect(allPrompts).toContain("Research the history of J");
    const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
    expect(allBlocks).toContain("haiku");
  });
});
