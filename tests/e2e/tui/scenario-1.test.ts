import { assertLlmReachable, seedTeam, FIXTURE } from "../_fixture.ts";
import { loadMockExpectations } from "../../../packages/mock-llm-backend";
import { startTui, stopTui, submitAndWaitForAgentIdle, waitForTeam, waitForTransient, waitForAgent, waitForAgentEffort, sendCmd, sendLine, type TuiHarness } from "./harness";
import expectations from "./scenario-1.llm.ts";

describe("Scenario 1 — simple agent", () => {
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

  test("team loads, prompt streams, idle closes", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await submitAndWaitForAgentIdle(harness, "Tell me a story", "my-team:general-1");
    const state = harness.stateStore.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
    const agent = state.agents.get("my-team:general-1");
    const allTurns = [
      ...(agent?.history ?? []),
      ...(agent?.currentTurn !== null && agent?.currentTurn !== undefined ? [agent.currentTurn] : []),
    ];
    const allBlocks = allTurns.flatMap((t) => t.blocks).map((b) => b.text).join("\n");
    expect(allBlocks.length).toBeGreaterThan(0);
    const allPrompts = allTurns.map((t) => t.userPrompt).join("\n");
    expect(allPrompts).toContain("Tell me a story");
    expect(agent?.status).toBe("idle");
    expect(agent?.model?.provider).toBe(FIXTURE.provider);
    expect(agent?.model?.id).toBe(FIXTURE.modelId);
    expect(agent?.contextTokensUsed).toBeGreaterThan(0);
  });

  test("/effort high applies immediately to the live agent", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    expect(harness.stateStore.getState().agents.get("my-team:general-1")?.model?.effort).toBe("off");
    await sendLine(harness.stdin, "/effort high");
    await waitForTransient(harness, "effort set to high");
    await waitForAgentEffort(harness, "my-team:general-1", "high");
    const agent = harness.stateStore.getState().agents.get("my-team:general-1");
    expect(agent?.model?.provider).toBe(FIXTURE.provider);
  });

  test("/reload rebuilds the loaded team from the edited manifest", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    expect(harness.stateStore.getState().agents.has("my-team:qa-1")).toBe(false);
    seedTeam(harness.dir, "my-team", "general", [
      { role: "general", systemPrompt: "You answer briefly.", tools: [] },
      { role: "qa", systemPrompt: "You review.", tools: [] },
    ]);
    await sendLine(harness.stdin, "/reload");
    await waitForTransient(harness, "reloaded settings, manifests, and context files");
    await waitForAgent(harness, "my-team:qa-1");
    const state = harness.stateStore.getState();
    expect(state.teamId).toBe("my-team");
    expect(state.agents.get("my-team:general-1")?.status).toBe("idle");
  });

  test("/rename names the active session and the name appears in listSessions", async () => {
    await sendLine(harness.stdin, "/team my-team");
    await waitForTeam(harness, "my-team");
    await submitAndWaitForAgentIdle(harness, "Say hi briefly", "my-team:general-1");
    await sendLine(harness.stdin, "/rename my named session");
    await waitForTransient(harness, "session renamed to my named session");
    const sessions = await harness.platform.execute({ name: "listSessions", teamId: "my-team" });
    expect(sessions[0]?.name).toBe("my named session");
  });

  test("ctrl+d on an empty editor quits cleanly", async () => {
    await sendCmd(harness.stdin, "\x04");
    await harness.exited;
  });
});
