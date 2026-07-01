import { loadFixture, replayEnvelopes } from "./harness";

describe("T2 — pass work in a team", () => {
  test("team loads with manager and worker; both agents keep separate conversations", async () => {
    const envelopes = await loadFixture("t2");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:manager-1");
    expect(state.agents.size).toBe(2);
    expect(state.agents.get("my-team:manager-1")?.role).toBe("manager");
    expect(state.agents.get("my-team:worker-1")?.role).toBe("worker");
  });

  test("manager turn has its delegation prompt and tool cards", async () => {
    const envelopes = await loadFixture("t2");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    const manager = state.agents.get("my-team:manager-1");
    expect(manager?.currentTurn?.userPrompt).toContain("my-answer.txt");
    const cards = manager?.currentTurn?.cards ?? [];
    expect(cards.some((c) => c.kind === "toolResult" && c.name === "read_file" && c.error === null)).toBe(true);
  });

  test("worker turn has its write_file tool call and 'task done' text", async () => {
    const envelopes = await loadFixture("t2");
    const { tui } = replayEnvelopes(envelopes);
    const state = tui.getState();
    const worker = state.agents.get("my-team:worker-1");
    expect(worker?.currentTurn?.cards.some((c) => c.kind === "toolResult" && c.name === "write_file")).toBe(true);
    const blocks = worker?.currentTurn?.blocks ?? [];
    expect(blocks.some((b) => b.text.includes("task done"))).toBe(true);
  });
});
