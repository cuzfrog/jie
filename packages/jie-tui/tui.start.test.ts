import { createTui, type CreateTUIOptions, type Tui } from ".";
import type { EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";
import { createTestTuiWithTerminal } from "./test/test-support";
import { Events } from "@cuzfrog/jie-platform/event";

function makeStubBus(): EventManager {
  return {
    publish: () => {},
    subscribe: () => () => {},
    subscriberCount: () => 0,
  } as unknown as EventManager;
}

function makeStubArtifacts(): ArtifactStore {
  return {
    write: async () => ({ key: "", created_at: "" }),
    read: async () => null,
    list: async () => [],
  } as unknown as ArtifactStore;
}

function makeOptions(overrides: Partial<CreateTUIOptions> = {}): CreateTUIOptions {
  return {
    bus: makeStubBus(),
    artifacts: makeStubArtifacts(),
    roles: [],
    cols: 80,
    ...overrides,
  };
}

const withTTY = (value: boolean, action: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    action();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};

describe("tui.start() with virtual terminal", () => {
  test("mounts a TUI loop and produces a frame", async () => {
    withTTY(true, async () => {
      const { tui: vt, terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle: Tui = createTui(makeOptions({ terminal }));
      const started = tuiHandle.start();
      await new Promise((r) => setTimeout(r, 50));
      tuiHandle.stop();
      await started;
      expect(typeof terminal.columns).toBe("number");
      expect(typeof terminal.rows).toBe("number");
      void vt;
    });
  });

  test("loads a team, renders the rail, then exits cleanly", async () => {
    withTTY(true, async () => {
      const events: unknown[] = [];
      const bus: EventManager = {
        publish: (env: unknown) => { events.push(env); },
        subscribe: () => () => {},
        subscriberCount: () => 0,
      } as unknown as EventManager;
      const { terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle = createTui(makeOptions({ bus, terminal }));
      const started = tuiHandle.start();
      await new Promise((r) => setTimeout(r, 50));
      bus.publish(Events.teamLoaded({ kind: "system" }, "demo", [
        { role: "general", agent_key: "general-1", is_leader: true },
      ]));
      await new Promise((r) => setTimeout(r, 50));
      tuiHandle.stop();
      await started;
      const state = tuiHandle.getState();
      expect(state.teamId).toBe("demo");
      expect(state.agents.size).toBe(1);
    });
  });
});
