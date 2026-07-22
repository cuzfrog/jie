import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLlmReachable, seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import { loadMockExpectations } from "../../../packages/mock-llm-backend/index.ts";
import {
  startTui,
  stopTui,
  submitAndWaitForAgentIdle,
  waitForConversationText,
  waitForNoErrorBanner,
  waitForTeam,
  sendCmd,
  sendLine,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-11.llm.ts";

const AGENT_ID = "my-team:general-1";
const SEED_PROMPT = "Remember the word: pineapple";
const SEED_REPLY = "Pineapple noted.";

async function waitForPicker(tui: TuiHarness["tui"], open: boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (tui.state.sessionPickerOpen === open) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`session picker did not reach open=${open}`);
}

describe("Scenario 11 — session picker overlay", () => {
  let harness: TuiHarness;

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team", "general", [
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("`/resume` opens the session picker overlay and Esc closes it", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await sendLine(harness.stdin, "/resume");
    await waitForPicker(harness.tui, true);
    await sendCmd(harness.stdin, "\x1b");
    await waitForPicker(harness.tui, false);
    await waitForNoErrorBanner(harness.tui);
  });
});

describe("Scenario 11 — resume hydrates the conversation", () => {
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

  async function runSeededSession(): Promise<string> {
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness.tui, "my-team");
      await submitAndWaitForAgentIdle(harness, SEED_PROMPT, AGENT_ID);
      const sessions = await harness.platform.execute({ name: "listSessions", teamId: "my-team" });
      if (sessions.length === 0) throw new Error("expected at least one persisted session");
      return sessions[0]!.sessionId;
    } finally {
      await stopTui(harness);
    }
  }

  test("startup --resume entry hydrates history on team load", async () => {
    const sessionId = await runSeededSession();
    const harness = await startTui({ cwd: dir, resumeSessionId: sessionId });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness.tui, "my-team");
      await waitForConversationText(harness.tui, AGENT_ID, SEED_REPLY);
      const agent = harness.tui.state.agents.get(AGENT_ID);
      const turns = agent?.currentTurn === null || agent?.currentTurn === undefined
        ? agent?.history ?? []
        : [...(agent?.history ?? []), agent.currentTurn];
      expect(turns.map((t) => t.userPrompt)).toContain(SEED_PROMPT);
      await waitForNoErrorBanner(harness.tui);
    } finally {
      await stopTui(harness);
    }
  });

  test("/resume picker entry hydrates history on resumeSession", async () => {
    await runSeededSession();
    const harness = await startTui({ cwd: dir });
    try {
      await sendLine(harness.stdin, "/team my-team");
      await waitForTeam(harness.tui, "my-team");
      await sendLine(harness.stdin, "/resume");
      await waitForPicker(harness.tui, true);
      await sendCmd(harness.stdin, "\r");
      await waitForPicker(harness.tui, false);
      await waitForConversationText(harness.tui, AGENT_ID, SEED_REPLY);
      const agent = harness.tui.state.agents.get(AGENT_ID);
      const turns = agent?.currentTurn === null || agent?.currentTurn === undefined
        ? agent?.history ?? []
        : [...(agent?.history ?? []), agent.currentTurn];
      expect(turns.map((t) => t.userPrompt)).toContain(SEED_PROMPT);
      await waitForNoErrorBanner(harness.tui);
    } finally {
      await stopTui(harness);
    }
  });
});
