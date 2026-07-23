import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForTeam, sendLine, type TuiHarness } from "./harness";
import expectations from "./scenario-2.llm.ts";

describe("Scenario 2 — pass work in a team", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    writeFileSync(join(harness.dir, "file1.txt"), "Hello world");
    seedTeam(harness.dir, "my-team", "manager", [
      { role: "manager", systemPrompt: "You delegate work to the worker.", tools: ["bash"] },
      { role: "worker", systemPrompt: "You execute tasks delegated by the manager.", tools: ["bash"] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("team loads with manager and worker; both agents keep separate conversations", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await submitAndWaitForAgentIdle(harness, "Read file1.txt and write its content to my-answer.txt", "my-team:manager-1");
    const state = harness.stateStore.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:manager-1");
    expect(state.agents.size).toBe(2);
    expect(state.agents.get("my-team:manager-1")?.role).toBe("manager");
    expect(state.agents.get("my-team:worker-1")?.role).toBe("worker");
  });

  test("manager drives a bash tool to completion", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await submitAndWaitForAgentIdle(harness, "Read file1.txt and write its content to my-answer.txt", "my-team:manager-1");
    const state = harness.stateStore.getState();
    const manager = state.agents.get("my-team:manager-1");
    const allTurns = [...(manager?.history ?? []), ...(manager?.currentTurn !== null && manager?.currentTurn !== undefined ? [manager.currentTurn] : [])];
    const allCards = allTurns.flatMap((t) => t.cards);
    expect(allCards.some((c) => c.kind === "toolResult" && c.name === "bash" && c.error === null)).toBe(true);
    const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
    expect(allBlocks.length).toBeGreaterThan(0);
  });
});
