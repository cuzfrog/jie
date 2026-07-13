import { Events, type AgentInfo } from "@cuzfrog/jie-platform";
import { render } from "../../test-renderer";
import { Footer } from "./footer";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const DEFAULT_DEMO_AGENTS: ReadonlyArray<AgentInfo> = [
  { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null },
];

function loadDemoTeam(stateStore: ReturnType<typeof createStateStore>, agents: ReadonlyArray<AgentInfo> = DEFAULT_DEMO_AGENTS): void {
  stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "demo",
    leaderKey: agents[0]?.agentKey ?? "general-1",
    agents,
  })));
}

describe("Footer", () => {
  test("shows cwd on the left and team:agent on the right", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("/tmp/proj");
    expect(frame).toContain("demo:general-1");
    unmount();
  });

  test("falls back to '(main)' when no branch is given", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("(main)");
    unmount();
  });

  test("shows 'no-team:—' when no team is loaded", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("no-team:—");
    unmount();
  });

  test("shows '(provider) modelId | effort' for the focused agent from team.loaded (model carried in the event)", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: null } }]);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("(lm-studio)");
    expect(frame).toContain("ornith-1.0-9b-mtp");
    expect(frame).toContain("| off");
    expect(frame).not.toMatch(/no-team:—/);
    unmount();
  });

  test("renders the model segment with '—' only when no agent is focused (no model yet)", () => {
    const stateStore = createStateStore();
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("—");
    unmount();
  });
});

describe("Footer queue indicator", () => {
  test("renders the queue indicator when the focused agent has queued prompts", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore);
    stateStore.dispatch(Actions.receiveEvent(Events.agentPromptQueueUpdate(
      { kind: "agent", teamId: "demo", agentKey: "general-1" },
      ["alpha", "beta"],
    )));
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("2 prompts queued");
    expect(frame).toContain("> alpha");
    unmount();
  });

  test("omits the queue indicator when the queue is empty", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).not.toContain("queued");
    unmount();
  });

  test("uses singular 'prompt' for a queue of length 1", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore);
    stateStore.dispatch(Actions.receiveEvent(Events.agentPromptQueueUpdate(
      { kind: "agent", teamId: "demo", agentKey: "general-1" },
      ["only-one"],
    )));
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("1 prompt queued");
    expect(lastFrame()).not.toContain("1 prompts queued");
    unmount();
  });

  test("does not render the queue indicator when no agent is focused", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).not.toContain("queued");
    unmount();
  });

  test("does not leak a non-focused agent's queue into the focused indicator", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [
      { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null },
      { teamId: "demo", role: "specialist", agentKey: "specialist-1", isLeader: false, model: null },
    ]);
    stateStore.dispatch(Actions.receiveEvent(Events.agentPromptQueueUpdate(
      { kind: "agent", teamId: "demo", agentKey: "specialist-1" },
      ["secondary"],
    )));
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).not.toContain("queued");
    unmount();
  });
});

describe("Footer context-% display", () => {
  test("shows '—' when no agent is focused", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("—");
    expect(frame).not.toMatch(/\d+%/);
    unmount();
  });

  test("shows '—' when the focused agent has no model assigned", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("—");
    expect(frame).not.toMatch(/\d+%/);
    unmount();
  });

  test("shows '—' when the model has contextWindow null", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "openai", id: "gpt-4", effort: "off", contextWindow: null } }]);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("—");
    expect(frame).not.toMatch(/\d+%/);
    unmount();
  });

  test("renders '0%/200k' when model has contextWindow 200000 and no usage yet", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "openai", id: "gpt-4", effort: "off", contextWindow: 200000 } }]);
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("0%/200k");
    unmount();
  });

  test("renders the percent derived from focused agent's contextTokensUsed", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "openai", id: "gpt-4", effort: "off", contextWindow: 1000 } }]);
    stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", "x".repeat(3200), "general-1")));
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("80%/1k");
    unmount();
  });

  test("clamps percent at 100 when used exceeds window", () => {
    const stateStore = createStateStore();
    loadDemoTeam(stateStore, [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "openai", id: "gpt-4", effort: "off", contextWindow: 1000 } }]);
    stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", "x".repeat(8000), "general-1")));
    const ctx = makeContextValue({ stateStore });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("100%/1k");
    unmount();
  });
});