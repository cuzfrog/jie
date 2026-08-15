import { seedTeam } from "../_fixture.ts";
import { loadMockExpectations } from "../../mock-llm-backend";
import { MockClient } from "../../mock-llm-backend/client.ts";
import {
  startTui,
  stopTui,
  waitForTeam,
  sendLine,
  submitAndWaitForAgentIdle,
  cardsOfTurns,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-loop-guard.llm.ts";

describe("Scenario — tool loop guard", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "loop-team", "general", [
      { role: "general", systemPrompt: "You are a file listing assistant.", tools: ["ls"] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("stops a repeated identical tool-call loop after one correction and surfaces the error", async () => {
    const systemErrors: string[] = [];
    const off = harness.platform.subscribe("system.error", (env) => {
      systemErrors.push(env.payload.error);
    });
    try {
      await sendLine(harness.stdin, "/team loop-team");
      await waitForTeam(harness, "loop-team");
      await submitAndWaitForAgentIdle(harness, "loop guard", "loop-team:general-1", 10000);
      const calls = await new MockClient().getCalls();
      expect(calls.length).toBeLessThanOrEqual(5);
      expect(systemErrors.length).toBeGreaterThanOrEqual(1);
      expect(systemErrors.some((error) => error.includes("ls"))).toBe(true);
      const state = harness.stateStore.getState();
      const agent = state.agents.get("loop-team:general-1");
      expect(agent).toBeDefined();
      expect(agent?.lastStopReason).toBe("aborted");
      expect(state.interruptedAgentId).toBe("loop-team:general-1");
      const turns = [...(agent?.history ?? []), ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : [])];
      const cards = cardsOfTurns(turns);
      const guardResult = cards.find((card) => card.kind === "toolResult" && (card.error?.includes("do not repeat") || card.error?.includes("aborted")));
      expect(guardResult).toBeDefined();
    } finally {
      off();
    }
  });
});
