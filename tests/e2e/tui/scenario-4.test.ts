import { writeFileSync } from "node:fs";
import { loadMockExpectations } from "../../mock-llm-backend";
import { assertLlmReachable, seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForErrorBanner, waitForNoErrorBanner, waitForTeam } from "./harness";
import expectations from "./scenario-4.llm.ts";

describe("Scenario 4 — first-time setup (TUI flow)", () => {
  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  test("empty settings → NO_MODEL_ERROR surfaces as error banner", async () => {
    const harness = await startTui();
    try {
      writeFileSync(`${harness.dir}/settings.json`, "{}");
      seedTeam(harness.dir, "my-team", "general", [
        { role: "general", systemPrompt: "You answer briefly.", tools: [] },
      ]);
      harness.tui.submit("/team my-team");
      await waitForErrorBanner(harness.tui, "No model has been selected");
    } finally {
      await stopTui(harness);
    }
  });

  test("after settings + retry, prompt streams and banner clears", async () => {
    const harness = await startTui();
    try {
      writeFileSync(`${harness.dir}/settings.json`, "{}");
      seedTeam(harness.dir, "my-team", "general", [
        { role: "general", systemPrompt: "You answer briefly.", tools: [] },
      ]);
      harness.tui.submit("/team my-team");
      await waitForErrorBanner(harness.tui, "No model has been selected");

      writeModelsJsonTo(harness.dir);
      writeSettingsJson(harness.dir);

      harness.tui.submit("/team my-team");
      await waitForTeam(harness.tui, "my-team");
      await waitForNoErrorBanner(harness.tui);
      await submitAndWaitForAgentIdle(harness, "Tell me a joke", "my-team:general-1");
      const agent = harness.tui.state.agents.get("my-team:general-1");
      const allTurns = [
        ...(agent?.history ?? []),
        ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
      ];
      const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
      expect(allBlocks.length).toBeGreaterThan(0);
    } finally {
      await stopTui(harness);
    }
  });
});