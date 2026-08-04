import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import {
  sendLine,
  startTui,
  stopTui,
  submitAndWaitForAgentIdle,
  waitForCompactionMarker,
  waitForConversationText,
  waitForTeam,
} from "./harness";
import expectations, { SUMMARY_TEXT } from "./scenario-14.llm.ts";

const AGENT_ID = "my-team:general-1";

describe("Scenario 14 — compaction rewrites history with a summary", () => {
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
      { role: "general", systemPrompt: "You answer briefly.", model: "e2e/e2e-tiny" },
    ]);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("an oversized turn is compacted and the next turn carries the summary", async () => {
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness, "my-team");
      await submitAndWaitForAgentIdle(harness, "produce a very long answer", AGENT_ID);
      await waitForCompactionMarker(harness, AGENT_ID, SUMMARY_TEXT);
      await submitAndWaitForAgentIdle(harness, "continue", AGENT_ID);
      await waitForConversationText(harness, AGENT_ID, "COMPACTED-CONTINUATION-OK");
      await waitForCompactionMarker(harness, AGENT_ID, SUMMARY_TEXT);
    } finally {
      await stopTui(harness);
    }
  });
});
