import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  submitAndWaitForAgentIdle,
  waitForAgentIdleCount,
  waitForTeam,
  sendLine,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-6.llm.ts";

describe("Scenario 6 — queued prompts from agent", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team", "manager", [
      { role: "manager", systemPrompt: "Manager delegates via notify.", tools: ["notify"] },
      { role: "worker", systemPrompt: "Worker handles delegated tasks.", tools: [], subscribe: ["task"] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("manager emits 5 notify tool cards and worker drains 5 queued turns", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    const state0 = harness.stateStore.getState();
    expect(state0.agents.size).toBe(2);
    expect(state0.leaderAgentId).toBe("my-team:manager-1");
    expect(state0.agents.get("my-team:worker-1")?.role).toBe("worker");

    const waitForWorker = waitForAgentIdleCount(harness, "my-team:worker-1", 5, 3000);
    await submitAndWaitForAgentIdle(harness, "send 5 math tasks to the worker 1 per message", "my-team:manager-1");

    const state = harness.stateStore.getState();
    const manager = state.agents.get("my-team:manager-1");
    expect(manager).toBeDefined();
    const allManagerTurns = [
      ...(manager!.history),
      ...(manager!.currentTurn !== null ? [manager!.currentTurn] : []),
    ];
    const allManagerCards = allManagerTurns.flatMap((t) => t.cards);
    const notifyCards = allManagerCards.filter((c) => c.name === "notify");
    expect(notifyCards.length).toBe(5);
    expect(notifyCards.every((c) => c.kind === "toolResult" && c.error === null)).toBe(true);

    await waitForWorker;

    // agent.idle does not rotate currentTurn into history (tui-state.md); the
    // completed fifth turn stays currentTurn until the next turn arrives.
    const stateAfter = harness.stateStore.getState();
    const worker = stateAfter.agents.get("my-team:worker-1");
    expect(worker).toBeDefined();
    expect(worker!.status).toBe("idle");
    expect(worker!.queue.length).toBe(0);
    const workerTurns = [...worker!.history, ...(worker!.currentTurn !== null ? [worker!.currentTurn] : [])];
    expect(workerTurns.length).toBe(5);
    expect(worker!.currentTurn?.blocks.some((b) => b.text.includes("task 5"))).toBe(true);
  });
});
