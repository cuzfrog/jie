import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedTeam, writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";
import { startTui, stopTui, sendLine, waitForTeam, waitForAgentModelId, waitForErrorBanner, type TuiHarness } from "./harness";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("Scenario — /model footer", () => {
  let harness: TuiHarness;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mf-"));
    writeModelsJsonTo(dir);
    writeSettingsJson(dir);
    harness = await startTui({ cwd: dir });
    seedTeam(harness.dir, "my-team", "general", [{ role: "general", systemPrompt: "x", tools: [] }]);
  });

  afterEach(async () => {
    await stopTui(harness);
    rmSync(dir, { recursive: true, force: true });
  });

  test("footer model string updates after /model", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");

    await sendLine(harness.stdin, "/model e2e/e2e-alt");
    await waitForAgentModelId(harness, "my-team:general-1", "e2e-alt");

    // Give the TUI render loop a chance to update the footer.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const state = harness.stateStore.getState();
    const footerComponent = harness.container.cradle.footer;
    footerComponent.update();
    const lines = footerComponent.render(120);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("e2e-alt");
    expect(text).not.toContain("dummy");
    expect(state.agents.get("my-team:general-1")?.model?.id).toBe("e2e-alt");
  });

  test("invalid /model leaves footer unchanged and surfaces an error", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");

    await sendLine(harness.stdin, "/model e2e/no-such-model");
    await waitForErrorBanner(harness, "Model could not be resolved");

    const state = harness.stateStore.getState();
    expect(state.agents.get("my-team:general-1")?.model?.id).toBe("dummy");

    const footerComponent = harness.container.cradle.footer;
    footerComponent.update();
    const lines = footerComponent.render(120);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("dummy");
    expect(text).not.toContain("no-such-model");
  });

  test("footer model string updates after /new then /model", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await sendLine(harness.stdin, "/new");
    await new Promise((resolve) => setTimeout(resolve, 100));

    await sendLine(harness.stdin, "/model e2e/e2e-alt");
    await waitForAgentModelId(harness, "my-team:general-1", "e2e-alt");

    await new Promise((resolve) => setTimeout(resolve, 300));

    const footerComponent = harness.container.cradle.footer;
    footerComponent.update();
    const lines = footerComponent.render(120);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("e2e-alt");
    expect(text).not.toContain("dummy");
  });

  test("footer model string updates after /model for a soul with an unmapped model alias", async () => {
    seedTeam(harness.dir, "alias-team", "general", [{ role: "general", systemPrompt: "x", tools: [], model: "large" }]);
    await sendLine(harness.stdin, "/team alias-team");
    await waitForTeam(harness, "alias-team");

    await sendLine(harness.stdin, "/model e2e/e2e-alt");
    await waitForAgentModelId(harness, "alias-team:general-1", "e2e-alt");

    await new Promise((resolve) => setTimeout(resolve, 300));

    const state = harness.stateStore.getState();
    const footerComponent = harness.container.cradle.footer;
    footerComponent.update();
    const lines = footerComponent.render(120);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("e2e-alt");
    expect(text).not.toContain("dummy");
    expect(state.agents.get("alias-team:general-1")?.model?.id).toBe("e2e-alt");
  });
});
