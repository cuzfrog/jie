import { seedTeam } from "../_fixture.ts";
import { loadMockExpectations } from "../../mock-llm-backend";
import {
  startTui,
  stopTui,
  submitAndWaitForAgentIdle,
  waitForAgent,
  waitForAgentBusy,
  waitForAgentIdle,
  waitForCompactionMarker,
  waitForErrorBanner,
  sendLine,
  waitForTeam,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-context-accounting.llm.ts";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("Scenario — context accounting", () => {
  let harness: TuiHarness;

  beforeAll(async () => {
    await loadMockExpectations(expectations);
  });

  beforeEach(async () => {
    harness = await startTui();
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("usage chunk sets honest contextTokensUsed and respects target context window", async () => {
    seedTeam(harness.dir, "ctx-team", "general", [
      { role: "general", model: "e2e/e2e-alt", targetContextWindowSize: 32000, systemPrompt: "You answer briefly." },
    ]);
    await sendLine(harness.stdin, "/team ctx-team");
    await waitForAgent(harness, "ctx-team:general-1");
    await submitAndWaitForAgentIdle(harness, "honest usage", "ctx-team:general-1");
    const agent = harness.stateStore.getState().agents.get("ctx-team:general-1");
    expect(agent?.model?.contextWindow).toBe(32000);
    expect(agent?.contextTokensUsed).toBe(1520);
    expect(agent?.contextTokensUsed).toBeGreaterThan(100);
  });

  test("context length error is surfaced when the request exceeds the mock limit", async () => {
    seedTeam(harness.dir, "limit-team", "general", [{ role: "general", systemPrompt: "You answer briefly." }]);
    await sendLine(harness.stdin, "/team limit-team");
    await waitForAgent(harness, "limit-team:general-1");
    await sendLine(harness.stdin, "trigger context limit");
    await waitForErrorBanner(harness, "context_length_exceeded");
    const agent = harness.stateStore.getState().agents.get("limit-team:general-1");
    expect(agent?.status).toBe("idle");
  });

  test("token meter shows accumulated session totals in the footer", async () => {
    seedTeam(harness.dir, "meter-team", "general", [{ role: "general", systemPrompt: "You answer briefly.", tools: [] }]);
    await sendLine(harness.stdin, "/team meter-team");
    await waitForTeam(harness, "meter-team");
    await submitAndWaitForAgentIdle(harness, "meter tokens", "meter-team:general-1");

    const agent = harness.stateStore.getState().agents.get("meter-team:general-1");
    expect(agent?.sessionInputTokens).toBe(12345);
    expect(agent?.sessionOutputTokens).toBe(678);
    expect(agent?.inflightInputTokens).toBe(0);
    expect(agent?.inflightOutputTokens).toBe(0);

    const footerComponent = harness.container.cradle.footer;
    footerComponent.update();
    const lines = footerComponent.render(120);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("12.3k↑");
    expect(text).toContain("0.7k↓");
    expect(text).not.toContain("0k↑");
  });

  test("compaction keeps overhead in reported context tokens", async () => {
    const longPrompt = "x".repeat(5000);
    seedTeam(harness.dir, "compact-team", "general", [
      { role: "general", model: "e2e/e2e-tiny", targetContextWindowSize: 1680, systemPrompt: longPrompt },
    ]);
    await sendLine(harness.stdin, "/team compact-team");
    await waitForAgent(harness, "compact-team:general-1");
    await submitAndWaitForAgentIdle(harness, `first compaction turn ${"x".repeat(1400)}`, "compact-team:general-1");

    await sendLine(harness.stdin, "continue after compaction");
    await waitForAgentBusy(harness, "compact-team:general-1");
    await waitForCompactionMarker(harness, "compact-team:general-1", "Summary of earlier conversation.");
    let agent = harness.stateStore.getState().agents.get("compact-team:general-1");
    expect(agent?.compactionMarker).not.toBeNull();
    expect(agent?.compactionMarker?.summary).toContain("Summary of earlier conversation.");
    expect(agent?.contextTokensUsed).toBeGreaterThan(1000);

    await waitForAgentIdle(harness, "compact-team:general-1");
    agent = harness.stateStore.getState().agents.get("compact-team:general-1");
    expect(agent?.contextTokensUsed).toBe(1610);
  }, 60000);
});
