import { type EventEnvelope } from "@cuzfrog/jie-platform";
import { attachNoModelBody, loadFixture, replayEnvelopes } from "./harness";

describe("T4 — first-time setup (TUI flow)", () => {
  test("first prompt raises an error banner about missing model", () => {
    const teamLoaded: EventEnvelope<"system.team.loaded"> = {
      version: 1,
      type: "system.team.loaded",
      topic: "system.team.loaded",
      sender: { kind: "system" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "my-team", agents: [{ role: "general", agent_key: "general-1", is_leader: true }] },
    };
    const { tui, bus } = replayEnvelopes([teamLoaded]);
    attachNoModelBody(bus, "my-team", "general-1");
    tui.submit("Tell me a joke");
    const state = tui.getState();
    expect(state.errorBanner).toBe(`[stop: error] No model has been selected`);
  });

  test("stop() unsubscribes from the bus", () => {
    const { tui, bus } = replayEnvelopes([]);
    const teamLoaded: EventEnvelope<"system.team.loaded"> = {
      version: 1,
      type: "system.team.loaded",
      topic: "system.team.loaded",
      sender: { kind: "system" },
      timestamp: new Date().toISOString(),
      payload: { teamId: "my-team", agents: [{ role: "general", agent_key: "general-1", is_leader: true }] },
    };
    bus.publish(teamLoaded);
    expect(bus.subscriberCount("system.team.loaded")).toBe(1);
    tui.stop();
    expect(bus.subscriberCount("system.team.loaded")).toBe(0);
  });

  test("error clears on the next user prompt and the response streams", async () => {
    const envelopes = await loadFixture("t4");
    const teamLoaded = envelopes[0]!;
    const userPrompt = envelopes[1]!;
    const rest = envelopes.slice(2);
    const { tui, bus } = replayEnvelopes([teamLoaded]);
    const stop = attachNoModelBody(bus, "my-team", "general-1");
    tui.submit("Tell me a joke");
    expect(tui.getState().errorBanner).toBe(`[stop: error] No model has been selected`);
    stop();
    bus.publish(userPrompt);
    for (const env of rest) bus.publish(env);
    const state = tui.getState();
    expect(state.errorBanner).toBeNull();
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.some((b) => b.text.includes("chicken"))).toBe(true);
  });
});
