import { seedTeam } from "../_fixture.ts";
import { loadMockExpectations } from "../../mock-llm-backend";
import { MockClient } from "../../mock-llm-backend/client.ts";
import {
  startTui,
  stopTui,
  waitForAgent,
  waitForConversationText,
  sendLine,
  type TuiHarness,
} from "./harness";
import expectations from "./scenario-stop-length.llm.ts";

const POLL_INTERVAL_MS = 10;

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${label}`);
}

describe("Scenario — stop reason length", () => {
  let harness: TuiHarness;

  beforeEach(async () => {
    await loadMockExpectations(expectations);
    harness = await startTui();
  });

  afterEach(async () => {
    await stopTui(harness);
  });

  test("bounded auto-continue recovers from a length-truncated empty response", async () => {
    const idleReasons: string[] = [];
    const systemErrors: string[] = [];
    const unsubscribes: Array<() => void> = [];
    unsubscribes.push(harness.platform.subscribe("agent.idle", (env) => {
      if (env.type === "agent.idle") idleReasons.push(env.payload);
    }));
    unsubscribes.push(harness.platform.subscribe("system.error", (env) => {
      if (env.type === "system.error") systemErrors.push(env.payload.error);
    }));
    try {
      seedTeam(harness.dir, "length-team", "general", [{ role: "general", systemPrompt: "You answer briefly." }]);
      await sendLine(harness.stdin, "/team length-team");
      await waitForAgent(harness, "length-team:general-1");
      await harness.platform.execute({ name: "renameSession", teamId: "length-team", sessionName: "length test" });
      await sendLine(harness.stdin, "length recover");
      await waitFor(
        () => {
          const agent = harness.stateStore.getState().agents.get("length-team:general-1");
          return agent?.status === "idle" && idleReasons.length >= 2 && idleReasons[idleReasons.length - 1] === "stop";
        },
        60000,
        "agent idle after recovery continuation",
      );
      await waitForConversationText(harness, "length-team:general-1", "Recovered answer.");
      expect(systemErrors).toHaveLength(1);
      expect(systemErrors[0]).toContain("Response truncated");
      const calls = await new MockClient().getCalls();
      expect(calls.length).toBe(2);
    } finally {
      for (const off of unsubscribes) off();
    }
  });

  test("a second length truncation in the same epoch is surfaced and not retried", async () => {
    const idleReasons: string[] = [];
    const systemErrors: string[] = [];
    const unsubscribes: Array<() => void> = [];
    unsubscribes.push(harness.platform.subscribe("agent.idle", (env) => {
      if (env.type === "agent.idle") idleReasons.push(env.payload);
    }));
    unsubscribes.push(harness.platform.subscribe("system.error", (env) => {
      if (env.type === "system.error") systemErrors.push(env.payload.error);
    }));
    try {
      seedTeam(harness.dir, "length-team", "general", [{ role: "general", systemPrompt: "You answer briefly." }]);
      await sendLine(harness.stdin, "/team length-team");
      await waitForAgent(harness, "length-team:general-1");
      await harness.platform.execute({ name: "renameSession", teamId: "length-team", sessionName: "length test" });
      await sendLine(harness.stdin, "length give up");
      await waitFor(
        () => {
          const agent = harness.stateStore.getState().agents.get("length-team:general-1");
          return agent?.status === "idle" && idleReasons.length >= 2;
        },
        60000,
        "agent idle after second length stop",
      );
      expect(idleReasons[idleReasons.length - 1]).toBe("length");
      expect(systemErrors.length).toBeGreaterThanOrEqual(1);
      const calls = await new MockClient().getCalls();
      expect(calls.length).toBe(2);
    } finally {
      for (const off of unsubscribes) off();
    }
  });
});
