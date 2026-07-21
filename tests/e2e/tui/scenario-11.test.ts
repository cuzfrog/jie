import { seedTeam } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  waitForNoErrorBanner,
  waitForTeam,
  sendCmd,
  sendLine,
  type TuiHarness,
} from "./harness";

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
