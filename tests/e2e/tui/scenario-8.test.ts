import { seedTeam } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  waitForEditorText,
  waitForNoErrorBanner,
  waitForTeam,
  waitForTransient,
  sendCmd,
  sendLine,
  type TuiHarness,
} from "./harness";

describe("Scenario 8 — slash-command autocomplete", () => {
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

  test("typing `/he` then Tab completes to `/help ` and Enter submits it", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await sendCmd(harness.stdin, "/he");
    await waitForEditorText(harness, "/he");
    await sendCmd(harness.stdin, "\t");
    await waitForEditorText(harness, "/help ");
    await sendCmd(harness.stdin, "\r");
    await waitForEditorText(harness, "");
    await waitForNoErrorBanner(harness);
    await waitForTransient(harness, "type a prompt");
  });
});
