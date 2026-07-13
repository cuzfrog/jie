import { loadMockExpectations } from "../../../packages/mock-llm-backend/index.ts";
import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForTeam, sendLine, type TuiHarness } from "./harness";
import expectations from "./scenario-5.llm.ts";

describe("Scenario 5 — second prompt after the first turn", () => {
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

  test("state captures both prompts and the haiku response", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await submitAndWaitForAgentIdle(harness, "Research the history of J", "my-team:general-1");
    await submitAndWaitForAgentIdle(harness, "Tell me a haiku", "my-team:general-1");

    const agent = harness.tui.state.agents.get("my-team:general-1");
    expect(agent).toBeDefined();
    const allTurns = [
      ...(agent?.history ?? []),
      ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
    ];
    expect(allTurns.length).toBeGreaterThanOrEqual(2);
    const allPrompts = allTurns.map((t) => t.userPrompt).join("\n");
    expect(allPrompts).toContain("Research the history of J");
    expect(allPrompts).toContain("Tell me a haiku");
    const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
    expect(allBlocks.length).toBeGreaterThan(0);
    expect(agent?.status).toBe("idle");
  });
});
