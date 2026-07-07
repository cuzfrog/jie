import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { render as inkRender } from "ink";
import { createTui, type Tui } from "./tui";
import { createStateStore, type StateStore } from "./state";
import { App } from "./components/app/app";
import { Events, type AnyEventEnvelope, type EventEnvelope, type EventType, type JiePlatform } from "@cuzfrog/jie-platform";
import { withTTY } from "../../tests/support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

class ReadableStdin extends EventEmitter {
  isTTY = true;
  private buffer: string | null = null;
  write(data: string): void {
    this.buffer = data;
    this.emit("readable");
  }
  read(): string | null {
    const data = this.buffer;
    this.buffer = null;
    return data;
  }
  setEncoding(): void {}
  setRawMode(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
}

interface AppHarness {
  stdin: ReadableStdin;
  frames: ReadonlyArray<string>;
  lastFrame(): string;
  unmount(): void;
}

function renderApp(tree: Parameters<typeof inkRender>[0]): AppHarness {
  const stdin = new ReadableStdin();
  const stdout = new PassThrough() as PassThrough & { columns: number; rows: number };
  stdout.columns = 100;
  stdout.rows = 30;
  const frames: string[] = [];
  const origWrite = stdout.write.bind(stdout);
  (stdout as unknown as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    frames.push(text);
    return origWrite(chunk);
  };
  const instance = inkRender(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
    debug: true,
  });
  return {
    stdin,
    get frames(): ReadonlyArray<string> { return frames; },
    lastFrame(): string {
      return frames[frames.length - 1] ?? "";
    },
    unmount(): void {
      instance.unmount();
    },
  };
}

const EMPTY_GIT = { branch: "", dirty: false, ahead: 0, behind: 0 };

type TopicHandler = (env: AnyEventEnvelope) => void;

interface MockPlatform {
  readonly platform: JiePlatform;
  readonly publish: <T extends EventType>(env: EventEnvelope<T>) => void;
}

function makePlatform(): MockPlatform {
  const subscribeHandlers = new Map<EventType, TopicHandler>();
  const platform: JiePlatform = {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as TopicHandler;
      subscribeHandlers.set(topic, handler);
      return () => {
        if (subscribeHandlers.get(topic) === handler) subscribeHandlers.delete(topic);
      };
    },
    prompt: () => undefined,
    interrupt: () => undefined,
    execute: (async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "getGitStatus") return EMPTY_GIT;
      return null;
    }) as JiePlatform["execute"],
    loadedTeams: () => [],
  };
  const publish = <T extends EventType>(env: EventEnvelope<T>): void => {
    const handler = subscribeHandlers.get(env.type);
    if (handler !== undefined) handler(env as AnyEventEnvelope);
  };
  return { platform, publish };
}

interface FakeTui extends Tui {
  readonly stateStore: StateStore;
}

function makeFakeTui(stateStore: StateStore, platform: JiePlatform): FakeTui {
  const fake = {
    state: stateStore.getState(),
    submit: () => undefined,
    start: () => Promise.resolve(),
    stop: () => undefined,
    stateStore,
    platform,
  } as unknown as FakeTui;
  Object.defineProperty(fake, "state", {
    get: () => stateStore.getState(),
    enumerable: true,
  });
  return fake;
}

describe("createTui — surface contract", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui({ cwd: process.cwd() }, { platform: makePlatform().platform })).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with initial empty state", () => {
    withTTY(true, () => {
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: makePlatform().platform });
      const s0 = tui.state;
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});

describe("App — ink render", () => {
  test("mounts and renders placeholder text", () => {
    const stateStore = createStateStore();
    const { platform } = makePlatform();
    const fakeTui = makeFakeTui(stateStore, platform);
    const { lastFrame, unmount } = renderApp(
      <App tui={fakeTui} platform={platform} cwd={process.cwd()} />,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the team id after a system.team.loaded event", async () => {
    const stateStore = createStateStore();
    const { platform } = makePlatform();
    const fakeTui = makeFakeTui(stateStore, platform);
    const { lastFrame, unmount } = renderApp(
      <App tui={fakeTui} platform={platform} cwd={process.cwd()} />,
    );
    stateStore.dispatch({ type: "[bus] receive event from event bus", payload: Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]) });
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain("general");
    unmount();
  });

  test("typing into the editor updates the displayed text", async () => {
    const stateStore = createStateStore();
    const { platform } = makePlatform();
    const fakeTui = makeFakeTui(stateStore, platform);
    const { stdin, lastFrame, unmount } = renderApp(
      <App tui={fakeTui} platform={platform} cwd={process.cwd()} />,
    );
    await new Promise((r) => setTimeout(r, 100));
    stdin.write("h");
    await new Promise((r) => setTimeout(r, 100));
    stdin.write("i");
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toContain("hi");
    unmount();
  });
});

import { TuiContext, type TuiContextValue } from "./components/context";
import { ChatPane } from "./components/chat/chat-pane";
import { AgentsRail } from "./components/rail/agents-rail";
import { Footer } from "./components/layout/footer";
import { Actions } from "./state";
import type { AgentUiState, TuiState } from "./state";

interface ContextOverrides {
  readonly state?: TuiState;
  readonly focusedAgent?: AgentUiState | null;
  readonly thinkingExpanded?: boolean;
  readonly toolCardsExpanded?: boolean;
}

function makeContextValue(overrides: ContextOverrides = {}): TuiContextValue {
  const stateStore = createStateStore();
  const platform = makePlatform().platform;
  const tui = makeFakeTui(stateStore, platform);
  return {
    tui,
    state: overrides.state ?? stateStore.getState(),
    stateStore,
    platform,
    focusedAgent: overrides.focusedAgent ?? null,
    thinkingExpanded: overrides.thinkingExpanded ?? false,
    toolCardsExpanded: overrides.toolCardsExpanded ?? false,
    setThinkingExpanded: () => undefined,
    setToolCardsExpanded: () => undefined,
  };
}

describe("ChatPane", () => {
  test("renders 'no focused agent' when no agent is focused", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = renderApp(
      <TuiContext.Provider value={ctx}><ChatPane width={40} /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("no focused agent");
    unmount();
  });

  test("renders user prompt with prefix and assistant block text", () => {
    const stateStore = createStateStore();
    stateStore.dispatch({ type: "[bus] receive event from event bus", payload: Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]) });
    stateStore.dispatch({
      type: "[bus] receive event from event bus",
      payload: Events.userPrompt({ kind: "user" }, "demo", "hello", "general-1"),
    });
    stateStore.dispatch({
      type: "[bus] receive event from event bus",
      payload: Events.agentStreamChunk({ kind: "agent", teamId: "demo", agentKey: "general-1" }, 1, 0, "text", "world"),
    });
    const ctx = makeContextValue({ state: stateStore.getState() });
    const { lastFrame, unmount } = renderApp(
      <TuiContext.Provider value={ctx}><ChatPane width={80} /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("hello");
    expect(frame).toContain("world");
    unmount();
  });
});

describe("AgentsRail", () => {
  test("shows leader pinned first with the leader glyph", () => {
    const stateStore = createStateStore();
    stateStore.dispatch({ type: "[bus] receive event from event bus", payload: Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "helper", agent_key: "helper-1", is_leader: false },
      { role: "general", agent_key: "general-1", is_leader: true },
    ]) });
    stateStore.dispatch(Actions.toggleTeamRail());
    const ctx = makeContextValue({ state: stateStore.getState() });
    const { lastFrame, unmount } = renderApp(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("★");
    const leaderIdx = frame.indexOf("general");
    const helperIdx = frame.indexOf("helper");
    expect(leaderIdx).toBeGreaterThanOrEqual(0);
    expect(helperIdx).toBeGreaterThan(leaderIdx);
    unmount();
  });
});

describe("Footer", () => {
  test("shows cwd on the left and team:agent on the right", () => {
    const stateStore = createStateStore();
    stateStore.dispatch({ type: "[bus] receive event from event bus", payload: Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]) });
    const state = stateStore.getState();
    const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId) ?? null;
    const ctx = makeContextValue({ state, focusedAgent: focused });
    const { lastFrame, unmount } = renderApp(
      <TuiContext.Provider value={ctx}><Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("/tmp/proj");
    expect(frame).toContain("demo:general-1");
    unmount();
  });
});