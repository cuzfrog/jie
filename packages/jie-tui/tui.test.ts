import { createTui, type Tui, type TuiDeps } from "./tui";
import { createEventManager, Events, type EventManager } from "@cuzfrog/jie-platform/event";
import type { AuthStore, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import { createTestTuiWithTerminal, withTTY } from "../../tests/support";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  write: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const teamRegistry = vi.mocked<TeamRegistry>({
  loadTeam: vi.fn(),
  isInstalled: vi.fn(),
  listInstalled: vi.fn(),
  locate: vi.fn(),
});

const loadTeam = vi.fn<() => Promise<void>>(() => Promise.resolve());

function makeDeps(overrides: Partial<TuiDeps> = {}): TuiDeps {
  return {
    eventManager: makeStubBus(),
    teamRegistry,
    loadTeam,
    authStore,
    settingsStore,
    settingsScope: "global" as Scope,
    ...overrides,
  };
}

function makeStubBus(): EventManager {
  return createEventManager();
}

describe("createTui — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui(makeDeps())).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui(makeDeps());
      const s0 = tui.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});

describe("createTui — start()", () => {
  test("throws when terminal is too narrow", () => {
    withTTY(true, () => {
      const { terminal } = createTestTuiWithTerminal(40, 30);
      const tuiHandle = createTui(makeDeps(), { terminal });
      expect(() => tuiHandle.start()).toThrow(/too narrow/);
    });
  });

  test("mounts a TUI loop and produces a frame", async () => {
    withTTY(true, async () => {
      const { tui: vt, terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle: Tui = createTui(makeDeps(), { terminal });
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
      const tuiHandle = createTui(makeDeps({ eventManager: bus }), { terminal });
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
