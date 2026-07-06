import { createTui, type Tui, type TuiDeps } from "../../../packages/jie-tui/tui";
import { Events, type AnyEventEnvelope, type EventEnvelope, type EventType } from "@cuzfrog/jie-platform";
import { createTestTuiWithTerminal, VirtualTerminal, withTTY } from "../../support";

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

function mount(cols: number, rows: number): {
  tui: Tui;
  terminal: VirtualTerminal;
  publish: <T extends EventType>(env: EventEnvelope<T>) => void;
} {
  const { platform, publish } = makePlatform();
  const { terminal } = createTestTuiWithTerminal(cols, rows);
  const tui: Tui = createTui({ cwd: "/home/cuz" }, { platform, terminal });
  tui.start();
  return { tui, terminal, publish };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 50));

describe("createTui — boot frame", () => {
  test("renders the editor and footer on first frame", async () => {
    withTTY(true, async () => {
      const { tui, terminal } = mount(80, 30);
      try {
        await tick();
        await terminal.waitForRender();
        const viewport = terminal.getViewport();
        const flat = viewport.join("\n");
        expect(flat).toContain("type a prompt");
        expect(flat).toContain("0%/200k");
      } finally {
        tui.stop();
      }
    });
  });

  test("team.loaded event populates the rail", async () => {
    withTTY(true, async () => {
      const { tui, terminal, publish } = mount(80, 30);
      try {
        publish(Events.teamLoaded({ kind: "system" }, "demo", [
          { role: "general", agent_key: "general-1", is_leader: true },
          { role: "researcher", agent_key: "researcher-1", is_leader: false },
        ]));
        await tick();
        await terminal.waitForRender();
        const viewport = terminal.getViewport();
        const flat = viewport.join("\n");
        expect(flat).toContain("general");
        expect(flat).toContain("researcher");
      } finally {
        tui.stop();
      }
    });
  });

  test("user.prompt event surfaces in the chat pane", async () => {
    withTTY(true, async () => {
      const { tui, terminal, publish } = mount(80, 30);
      try {
        publish(Events.teamLoaded({ kind: "system" }, "demo", [
          { role: "general", agent_key: "general-1", is_leader: true },
        ]));
        await tick();
        publish(Events.userPrompt({ kind: "user" }, "demo", "hello world", "general-1"));
        await tick();
        await terminal.waitForRender();
        const viewport = terminal.getViewport();
        const flat = viewport.join("\n");
        expect(flat).toContain("hello world");
      } finally {
        tui.stop();
      }
    });
  });
});
