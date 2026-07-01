import { createTui, type CreateTUIOptions, type Tui } from "./tui";
import { createEventManager, Events, type EventManager } from "@cuzfrog/jie-platform/event";
import { createTestTuiWithTerminal, withTTY } from "../../tests/support";

function makeStubBus(): EventManager {
  return createEventManager();
}

function makeOptions(overrides: Partial<CreateTUIOptions> = {}): CreateTUIOptions {
  return {
    eventManager: makeStubBus(),
    cols: 80,
    ...overrides,
  };
}

describe("createTui — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui(makeOptions())).toThrow(/interactive terminal/);
    });
  });

  test("throws when terminal is too narrow", () => {
    withTTY(true, () => {
      expect(() => createTui(makeOptions({ cols: 40 }))).toThrow(/too narrow/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui(makeOptions());
      const s0 = tui.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});

describe("createTui — start()", () => {
  test("mounts a TUI loop and produces a frame", async () => {
    withTTY(true, async () => {
      const { tui: vt, terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle: Tui = createTui(makeOptions({ terminal }));
      const started = tuiHandle.start();
      await new Promise((r) => setTimeout(r, 50));
      tuiHandle.stop();
      await started;
      expect(terminal.columns).toBe(80);
      expect(terminal.rows).toBe(30);
      expect(terminal.getViewport().length).toBe(30);
      void vt;
    });
  });

  test("loads a team, renders the rail, then exits cleanly", async () => {
    withTTY(true, async () => {
      const bus: EventManager = createEventManager();
      const { terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle = createTui(makeOptions({ eventManager: bus, terminal }));
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
