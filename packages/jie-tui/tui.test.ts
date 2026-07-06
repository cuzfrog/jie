import { createTui, type Tui, type TuiDeps } from "./tui";
import { Events, type AnyEventEnvelope, type EventEnvelope, type EventType } from "@cuzfrog/jie-platform";
import { createTestTuiWithTerminal, withTTY } from "../../tests/support";

const EMPTY_GIT = { branch: "", dirty: false, ahead: 0, behind: 0 };

type TopicHandler = (env: AnyEventEnvelope) => void;

function makePlatform() {
  const subscribeHandlers = new Map<EventType, TopicHandler>();
  const platform = {
    team: { id: "minimal", agents: [] },
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(<T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as TopicHandler;
      subscribeHandlers.set(topic, handler);
      return () => {
        if (subscribeHandlers.get(topic) === handler) subscribeHandlers.delete(topic);
      };
    }),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: vi.fn(async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "getGitStatus") return EMPTY_GIT;
      return null;
    }),
  };
  const publish = <T extends EventType>(env: EventEnvelope<T>): void => {
    const handler = subscribeHandlers.get(env.type);
    if (handler !== undefined) handler(env as AnyEventEnvelope);
  };
  return { platform: platform as unknown as TuiDeps["platform"], publish };
}

function makeDeps(overrides: { platform?: TuiDeps["platform"] } = {}): TuiDeps {
  const { platform } = makePlatform();
  return { platform: overrides.platform ?? platform };
}

describe("createTui — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui({ cwd: process.cwd() }, makeDeps())).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui({ cwd: process.cwd() }, makeDeps());
      const s0 = tui.state;
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
      const tuiHandle = createTui({ cwd: process.cwd() }, { ...makeDeps(), terminal });
      expect(() => tuiHandle.start()).toThrow(/too narrow/);
    });
  });

  test("mounts a TUI loop and produces a frame", async () => {
    withTTY(true, async () => {
      const { tui: vt, terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle: Tui = createTui({ cwd: process.cwd() }, { ...makeDeps(), terminal });
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
      const { platform, publish } = makePlatform();
      const { terminal } = createTestTuiWithTerminal(80, 30);
      const tuiHandle = createTui({ cwd: process.cwd() }, { platform, terminal });
      const started = tuiHandle.start();
      await new Promise((r) => setTimeout(r, 50));
      publish(Events.teamLoaded({ kind: "system" }, "demo", [
        { role: "general", agent_key: "general-1", is_leader: true },
      ]));
      await new Promise((r) => setTimeout(r, 50));
      tuiHandle.stop();
      await started;
      const state = tuiHandle.state;
      expect(state.teamId).toBe("demo");
      expect(state.agents.size).toBe(1);
    });
  });
});
