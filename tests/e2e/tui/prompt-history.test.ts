import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import { sendCmd, sendLine, startTui, stopTui, submitAndWaitForAgentIdle, waitForEditorText, waitForTeam, type TuiHarness } from "./harness";
import expectations from "./prompt-history.llm.ts";

const AGENT_ID = "my-team:general-1";
const PROMPT = "Tell me the count.";

describe("Prompt history — persisted across restarts", () => {
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
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
    ]);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("submits append JSON lines to prompt-history.jsonl in the jie home dir", async () => {
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness, "my-team");
      await submitAndWaitForAgentIdle(harness, PROMPT, AGENT_ID);
      const lines = readFileSync(join(dir, "prompt-history.jsonl"), "utf8").trim().split("\n");
      expect(lines.map((line): string => JSON.parse(line).prompt)).toContain(PROMPT);
    } finally {
      await stopTui(harness);
    }
  });

  test("up arrow after restart restores the last submitted prompt", async () => {
    const seeded = await startTui({ cwd: dir });
    try {
      await sendLine(seeded.stdin, "/team my-team");
      await waitForTeam(seeded, "my-team");
      await submitAndWaitForAgentIdle(seeded, PROMPT, AGENT_ID);
    } finally {
      await stopTui(seeded);
    }

    const harness: TuiHarness = await startTui({ cwd: dir });
    try {
      await sendCmd(harness.stdin, "\x1b[A");
      await waitForEditorText(harness, PROMPT);
    } finally {
      await stopTui(harness);
    }
  });
});
