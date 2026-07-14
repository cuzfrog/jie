import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import { loadMockExpectations } from "../../../packages/mock-llm-backend/index.ts";
import { startTui, stopTui, waitForTeam, sendLine, submitAndWaitForAgentIdle, type TuiHarness } from "./harness";
import expectations from "./scenario-7.llm.ts";

describe("Scenario 7 — ! bash mode", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team", "general", [
      { role: "general", systemPrompt: "You run shell commands verbatim.", tools: ["bash"] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("!ls -la routes through the bash tool and the output lands as a tool card", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await submitAndWaitForAgentIdle(harness, "!ls -la", "my-team:general-1");
    const state = harness.tui.state;
    const agent = state.agents.get("my-team:general-1");
    expect(agent).toBeDefined();
    const turns = [...(agent?.history ?? []), ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : [])];
    const cards = turns.flatMap((t) => t.cards);
    expect(cards.some((c) => c.kind === "toolResult" && c.name === "bash" && c.error === null)).toBe(true);
  });

  test("bare ! surfaces a no-command error and does not call the LLM", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    const priorHistoryLen = harness.tui.state.agents.get("my-team:general-1")?.history.length ?? 0;
    await sendLine(harness.stdin, "!");
    await new Promise((r) => setTimeout(r, 200));
    const state = harness.tui.state;
    expect(state.errorBanner).toMatch(/bash mode requires a command/);
    const historyLenAfter = state.agents.get("my-team:general-1")?.history.length ?? 0;
    expect(historyLenAfter).toBe(priorHistoryLen);
  });
});
