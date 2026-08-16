import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMockExpectations } from "../../mock-llm-backend";
import { seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import { sendCmd, sendLine, startTui, stopTui, submitAndWaitForAgentIdle, waitFor, waitForEditorText, waitForTeam, type TuiHarness } from "./harness";
import expectations from "./prompt-history.llm.ts";

const AGENT_ID = "my-team:general-1";
const PROMPT = "Tell me the count.";

describe("Prompt history — persisted across restarts", () => {
  let dir: string;

  beforeAll(async () => {
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

  test("/new starts a fresh session and /resume restores the previous one", async () => {
    const harness: TuiHarness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness, "my-team");
      await submitAndWaitForAgentIdle(harness, PROMPT, AGENT_ID);
      const before = harness.stateStore.getState();
      const oldSessionId = before.sessionId;
      const oldInputTokens = before.agents.get(AGENT_ID)?.sessionInputTokens;
      expect(oldSessionId).not.toBeNull();
      expect(oldInputTokens).toBe(12345);
      expect(before.agents.get(AGENT_ID)?.currentTurn?.userPrompt).toBe(PROMPT);

      await sendLine(harness.stdin, "/new");
      await waitFor(() => {
        const s = harness.stateStore.getState();
        return s.sessionId !== oldSessionId && s.sessionId !== null && s.agents.has(AGENT_ID) && s.agents.get(AGENT_ID)!.currentTurn === null;
      }, 60000, "new session loaded");
      const afterNew = harness.stateStore.getState();
      expect(afterNew.agents.get(AGENT_ID)?.sessionInputTokens).toBe(0);
      expect(afterNew.agents.get(AGENT_ID)?.currentTurn).toBeNull();

      await submitAndWaitForAgentIdle(harness, "confirm new session", AGENT_ID);
      const afterPrompt = harness.stateStore.getState();
      expect(afterPrompt.sessionId).not.toBe(oldSessionId);
      expect(afterPrompt.agents.get(AGENT_ID)?.currentTurn?.userPrompt).toBe("confirm new session");
      expect(afterPrompt.agents.get(AGENT_ID)?.sessionInputTokens).toBe(12345);

      await sendLine(harness.stdin, `/resume ${oldSessionId}`);
      await waitFor(() => {
        const s = harness.stateStore.getState();
        return s.sessionId === oldSessionId && s.agents.has(AGENT_ID) && s.agents.get(AGENT_ID)!.currentTurn !== null;
      }, 60000, "resumed old session");
      const resumed = harness.stateStore.getState();
      expect(resumed.agents.get(AGENT_ID)?.sessionInputTokens).toBe(12345);
      expect(resumed.agents.get(AGENT_ID)?.currentTurn?.userPrompt).toBe(PROMPT);
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
