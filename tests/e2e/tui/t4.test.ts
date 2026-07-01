import { createEventManager, type EventEnvelope } from "@cuzfrog/jie-platform/event";
import { attachNoModelBody, loadFixture, NO_MODEL_ERROR, startTuiOn } from "./harness";

describe("T4 — first-time setup (TUI flow)", () => {
  test("team loads, first prompt raises an error banner about missing model", () => {
    const bus = createEventManager();
    const teamLoaded: EventEnvelope<"system.team.loaded"> = {
      version: 1,
      type: "system.team.loaded",
      topic: "system.team.loaded",
      sender: { kind: "system" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "my-team", agents: [{ role: "general", agent_key: "general-1", is_leader: true }] },
    };
    const tui = startTuiOn(bus, [teamLoaded]);
    const stop = attachNoModelBody(bus, "my-team", "general-1", "general");
    tui.submit("Tell me a joke");
    const state = tui.getState();
    expect(state.errorBanner).toBe(`[stop: error] ${NO_MODEL_ERROR}`);
    stop();
  });

  test("error clears on the next user prompt and the response streams", async () => {
    const envelopes = await loadFixture("t4");
    const teamLoaded = envelopes[0]!;
    const userPrompt = envelopes[1]!;
    const rest = envelopes.slice(2);
    const bus = createEventManager();
    const tui = startTuiOn(bus, [teamLoaded]);
    const stop = attachNoModelBody(bus, "my-team", "general-1", "general");
    tui.submit("Tell me a joke");
    expect(tui.getState().errorBanner).toBe(`[stop: error] ${NO_MODEL_ERROR}`);
    stop();
    bus.publish(userPrompt);
    for (const env of rest) bus.publish(env);
    const state = tui.getState();
    expect(state.errorBanner).toBeNull();
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.some((b) => b.text.includes("chicken"))).toBe(true);
  });
});
