import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import {
  startTui,
  stopTui,
  waitForEditorText,
  waitForNoErrorBanner,
  waitForTeam,
  sendCmd,
  sendLine,
  type TuiHarness,
} from "./harness";

describe("Scenario 9 — @-mention autocomplete", () => {
  let harness: TuiHarness;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "jie-tui-e2e-"));
    writeModelsJsonTo(dir);
    writeSettingsJson(dir);
    seedTeam(dir, "my-team", "general", [
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
    ]);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "src", "helper.ts"), "export const y = 2;\n");
    harness = await startTui({ cwd: dir });
  });

  afterEach(async () => {
    await stopTui(harness);
    rmSync(dir, { recursive: true, force: true });
  });

  test("typing `@main` then Tab inserts the resolved file path into the editor text", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness.tui, "my-team");
    await sendCmd(harness.stdin, "@main");
    await waitForEditorText(harness.tui, "@main");
    await sendCmd(harness.stdin, "\t");
    await waitForEditorText(harness.tui, "@src/main.ts ");
    await waitForNoErrorBanner(harness.tui);
  });
});
