import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForTeam, sendLine, type TuiHarness } from "./harness";
import expectations from "./scenario-3.llm.ts";

describe("Scenario 3 — switch teams", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team-1", "general", [
      { role: "general", systemPrompt: "You are the my-team-1 leader. Reply with 'Count: 1, 2, 3.'", tools: [] },
    ]);
    seedTeam(harness.dir, "my-team-2", "general", [
      { role: "general", systemPrompt: "You are the my-team-2 leader. Reply with 'Once upon a story.'", tools: [] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("swap to a second team loads new agents", async () => {
    await sendLine(harness.stdin, "/team my-team-1");
    await waitForTeam(harness, "my-team-1");
    await submitAndWaitForAgentIdle(harness, "go", "my-team-1:general-1");
    expect(harness.stateStore.getState().agents.get("my-team-1:general-1")?.currentTurn?.blocks.some((b) => b.text.includes("3"))).toBe(true);

    await sendLine(harness.stdin, "/team my-team-2");
    await waitForTeam(harness, "my-team-2");
    await submitAndWaitForAgentIdle(harness, "go", "my-team-2:general-1");

    const state = harness.stateStore.getState();
    expect(state.teamId).toBe("my-team-2");
    expect(state.agents.size).toBe(1);
    expect(state.agents.has("my-team-1:general-1")).toBe(false);
    expect(state.agents.has("my-team-2:general-1")).toBe(true);
    expect(state.agents.get("my-team-2:general-1")?.currentTurn?.blocks.some((b) => b.text.includes("story"))).toBe(true);
  });

  test("swap back to first team re-seeds", async () => {
    await sendLine(harness.stdin, "/team my-team-1");
    await waitForTeam(harness, "my-team-1");
    await sendLine(harness.stdin, "/team my-team-2");
    await waitForTeam(harness, "my-team-2");
    await sendLine(harness.stdin, "/team my-team-1");
    await waitForTeam(harness, "my-team-1");
    expect(harness.stateStore.getState().agents.has("my-team-1:general-1")).toBe(true);
  });
});
