import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedSkill, seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import {
  sendLine,
  startTui,
  stopTui,
  submitAndWaitForAgentIdle,
  waitForConversationText,
  waitForErrorBanner,
  waitForTeam,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-13.llm.ts";

const AGENT_ID = "my-team:general-1";

describe("Scenario 13 — /skill:<name> invocation", () => {
  let dir: string;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-tui-e2e-"));
    writeModelsJsonTo(dir);
    writeSettingsJson(dir);
    seedTeam(dir, "my-team", "general", [
      { role: "general", systemPrompt: "You are a general assistant.", skills: ["say-hello"] },
    ]);
    seedSkill(dir, "say-hello", "Greet someone warmly", "Greet the person by the name that follows the command.");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("invoking a configured skill expands it before it reaches the LLM", async () => {
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness, "my-team");
      await submitAndWaitForAgentIdle(harness, "/skill:say-hello Cause", AGENT_ID);
      await waitForConversationText(harness, AGENT_ID, "Hello, Cause!");
      expect(turnPrompts(harness)).toContain("/skill:say-hello Cause");
    } finally {
      await stopTui(harness);
    }
  });

  test("invoking a skill the agent does not have shows an error and never reaches the LLM", async () => {
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness, "my-team");
      await sendLine(harness.stdin, "/skill:unknown-skill");
      await waitForErrorBanner(harness, "not available on agent");
      expect(turnPrompts(harness)).toEqual([]);
    } finally {
      await stopTui(harness);
    }
  });
});

function turnPrompts(harness: TuiHarness): ReadonlyArray<string> {
  const agent = harness.stateStore.getState().agents.get(AGENT_ID);
  if (agent === undefined) return [];
  const turns = agent.currentTurn === null ? agent.history : [...agent.history, agent.currentTurn];
  return turns.map((turn) => turn.userPrompt);
}
