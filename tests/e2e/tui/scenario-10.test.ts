import { seedTeam } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  waitForErrorBanner,
  waitForNoErrorBanner,
  waitForTeam,
  sendLine,
  type TuiHarness,
} from "./harness";

describe("Scenario 10 — error banner renderer", () => {
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

  test("triggering an unknown slash command shows the error banner and clears it on next input", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await sendLine(harness.stdin, "/nonexistent-command");
    await waitForErrorBanner(harness.tui, "unknown slash command");
    await sendLine(harness.stdin, "/help");
    await waitForNoErrorBanner(harness.tui);
  });
});
