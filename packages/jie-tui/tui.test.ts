import { createTui, type Tui, type TuiDeps } from "./tui";
import { createEventManager, Events, type EventManager, type AnyEventEnvelope, type EventEnvelope, type EventType } from "@cuzfrog/jie-platform/event";
import { createTestTuiWithTerminal, withTTY } from "../../tests/support";

const EMPTY_GIT = { branch: "", dirty: false, ahead: 0, behind: 0 };

function makePlatform(bus: EventManager = createEventManager()) {
  const subscribeHandlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const platform = {
    events: bus,
    team: { id: "minimal", agents: [] },
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(<T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      subscribeHandlers.set(topic, cb as (env: AnyEventEnvelope) => void);
      return bus.subscribe(topic, cb);
    }),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: vi.fn(async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "getGitStatus") return EMPTY_GIT;
      return null;
    }),
  };
  return { platform: platform as unknown as Parameters<typeof createTui>[0]["platform"], bus, subscribeHandlers };
}

function makeDeps(overrides: { bus?: EventManager; platform?: Parameters<typeof createTui>[0]["platform"] } = {}): TuiDeps {
  const { platform } = makePlatform(overrides.bus);
  return { platform: overrides.platform ?? platform };
}

describe("createTui — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui(makeDeps(), { cwd: process.cwd() })).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui(makeDeps(), { cwd: process.cwd() });
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
      const { bus, platform } = makePlatform();
      const { terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle = createTui({ platform }, { cwd: process.cwd(), terminal });
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