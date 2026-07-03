import { createTui, type CreateTUIOptions, type Tui, type TuiDeps } from "./tui";
import { createEventManager, Events, type EventManager } from "@cuzfrog/jie-platform/event";
import type { AuthStore, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { GitService } from "@cuzfrog/jie-platform/services";
import { createTestTuiWithTerminal, withTTY } from "../../tests/support";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
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
  parseTeamManifest: vi.fn(),
  isInstalled: vi.fn(),
  listInstalled: vi.fn(),
  locate: vi.fn(),
});

const gitService = vi.mocked<GitService>({
  getSnapshot: vi.fn(),
});

const loadTeam = vi.fn<() => Promise<void>>(() => Promise.resolve());

const stubOptions: CreateTUIOptions = { cwd: process.cwd() };

function makeDeps(overrides: Partial<TuiDeps> = {}): TuiDeps {
  return {
    eventManager: makeStubBus(),
    teamRegistry,
    loadTeam,
    authStore,
    gitService,
    settingsStore,
    settingsScope: "global" as Scope,
    ...overrides,
  };
}

function makeStubBus(): EventManager {
  return createEventManager();
}

describe("createTui — v0.2 surface", () => {
  beforeEach(() => {
    gitService.getSnapshot.mockReturnValue({ branch: "", dirty: false, ahead: 0, behind: 0 });
  });

  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui(makeDeps(), stubOptions)).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui(makeDeps(), stubOptions);
      const s0 = tui.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});

describe("createTui — start()", () => {
  beforeEach(() => {
    gitService.getSnapshot.mockReturnValue({ branch: "", dirty: false, ahead: 0, behind: 0 });
  });

  test("throws when terminal is too narrow", () => {
    withTTY(true, () => {
      const { terminal } = createTestTuiWithTerminal(40, 30);
      const tuiHandle = createTui(makeDeps(), { cwd: process.cwd(), terminal });
      expect(() => tuiHandle.start()).toThrow(/too narrow/);
    });
  });

  test("mounts a TUI loop and produces a frame", async () => {
    withTTY(true, async () => {
      const { tui: vt, terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle: Tui = createTui(makeDeps(), { cwd: process.cwd(), terminal });
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
      const tuiHandle = createTui(makeDeps({ eventManager: bus }), { cwd: process.cwd(), terminal });
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
