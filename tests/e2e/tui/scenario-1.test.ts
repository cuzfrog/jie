import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import { loadMockExpectations } from "../../../packages/mock-llm-backend/index.ts";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForTeam, sendLine, type TuiHarness } from "./harness";
import expectations from "./scenario-1.llm.ts";

describe("Scenario 1 — simple agent", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team", "general", [
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("team loads, prompt streams, idle closes; rail hidden by default", async () => {
    sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await submitAndWaitForAgentIdle(harness, "Tell me a story", "my-team:general-1");
    const state = harness.tui.state;
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
    expect(state.showTeamRailPanel).toBe(false);
    const agent = state.agents.get("my-team:general-1");
    const allTurns = [
      ...(agent?.history ?? []),
      ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
    ];
    const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
    expect(allBlocks.length).toBeGreaterThan(0);
    const allPrompts = allTurns.map((t) => t.userPrompt).join("\n");
    expect(allPrompts).toContain("Tell me a story");
    expect(agent?.status).toBe("idle");
  });
});
