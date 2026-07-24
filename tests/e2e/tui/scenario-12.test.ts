import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { assertLlmReachable, seedTeam } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  sendCmd,
  sendLine,
  waitForAgentBusy,
  waitForAgentIdle,
  waitForEditorText,
  waitForTeam,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-12.llm.ts";

describe("Scenario 12 — core keybindings", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
    seedTeam(harness.dir, "my-team", "general", [
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
    ]);
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("esc interrupts the busy focused agent", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await sendLine(harness.stdin, "Count to three.");
    await waitForAgentBusy(harness, "my-team:general-1");
    await sendCmd(harness.stdin, "\x1b");
    await waitForAgentIdle(harness, "my-team:general-1");
    const agent = harness.stateStore.getState().agents.get("my-team:general-1");
    expect(agent?.status).toBe("idle");
    expect(agent?.lastStopReason).toBe("aborted");
  });

  test("ctrl+c clears a non-empty editor, then quits on empty", async () => {
    await sendCmd(harness.stdin, "interrupt me");
    await waitForEditorText(harness, "interrupt me");
    await sendCmd(harness.stdin, "\x03");
    await waitForEditorText(harness, "");
    await sendCmd(harness.stdin, "\x03");
    await harness.exited;
  });

  test("ctrl+d on an empty editor quits", async () => {
    await sendCmd(harness.stdin, "\x04");
    await harness.exited;
  });
});
