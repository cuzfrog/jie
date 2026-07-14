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

  test("typing `/he` then Tab commits the resolved slash command directly without an extra Enter", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await sendCmd(harness.stdin, "/he");
    await waitForEditorText(harness.tui, "/he");
    await sendCmd(harness.stdin, "\t");
    await waitForEditorText(harness.tui, "");
    await waitForNoErrorBanner(harness.tui);
    await waitForTransient(harness.tui, "type a prompt");
  });
});
