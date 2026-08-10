import { visibleWidth } from "@earendil-works/pi-tui";
import { type StateStore } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { QueuedPrompts } from "./queued-prompts";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function stateWithQueue(queue: ReadonlyArray<{ text: string; source: "user" | "peer" }>) {
  const agent = makeAgentUiState("my-team:general-1", { queue });
  return makeTuiState({
    teamId: "my-team",
    agents: new Map([[agent.agentId, agent]]),
    focusedAgentId: agent.agentId,
  });
}

function userEntry(text: string): { text: string; source: "user" | "peer" } {
  return { text, source: "user" };
}

describe("QueuedPrompts", () => {
  test("renders one dim line per queued prompt", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("first"), userEntry("second")]));
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual([
      "\x1b[90mQueued: first\x1b[39m",
      "\x1b[90mQueued: second\x1b[39m",
    ]);
  });

  test("renders peer notifications verbatim alongside user prompts", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([
      userEntry("hello"),
      { text: "[qa-1 on 'task.recorded']: report", source: "peer" },
    ]));
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual([
      "\x1b[90mQueued: hello\x1b[39m",
      "\x1b[90mQueued: [qa-1 on 'task.recorded']: report\x1b[39m",
    ]);
  });

  test("flattens newlines so each entry renders on a single line", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("line one\nline two\r\nline three")]));
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual(["\x1b[90mQueued: line one line two line three\x1b[39m"]);
  });

  test("renders nothing when the queue is empty", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([]));
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual([]);
  });

  test("renders nothing when no agent is focused", () => {
    stateStore.getState.mockReturnValue(makeTuiState());
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual([]);
  });

  test("never renders a line wider than the given width", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("x".repeat(300))]));
    const component = new QueuedPrompts(stateStore);
    for (const width of [13, 40, 80]) {
      for (const line of component.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("QueuedPrompts.update", () => {
  test("reports dirty when the focused queue changes", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("first")]));
    const component = new QueuedPrompts(stateStore);
    component.update();
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("first"), userEntry("second")]));
    expect(component.update()).toBe(true);
  });

  test("reports dirty when the focused agent changes", () => {
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("first")]));
    const component = new QueuedPrompts(stateStore);
    component.update();
    stateStore.getState.mockReturnValue(makeTuiState());
    expect(component.update()).toBe(true);
  });

  test("reports clean when the watched slice is unchanged", () => {
    const state = stateWithQueue([userEntry("first")]);
    stateStore.getState.mockReturnValue(state);
    const component = new QueuedPrompts(stateStore);
    expect(component.update()).toBe(true);
    expect(component.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    const agent = makeAgentUiState("my-team:general-1", { queue: [userEntry("hi")] });
    const agents = new Map([[agent.agentId, agent]]);
    stateStore.getState.mockReturnValue(makeTuiState({ agents, focusedAgentId: agent.agentId }));
    const component = new QueuedPrompts(stateStore);
    component.update();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, focusedAgentId: agent.agentId, kanbanView: "list" }));
    expect(component.update()).toBe(false);
  });
});
