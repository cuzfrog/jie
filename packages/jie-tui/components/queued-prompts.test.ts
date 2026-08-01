import { visibleWidth } from "@earendil-works/pi-tui";
import { type StateStore } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import { QueuedPrompts } from "./queued-prompts";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function stateWithQueue(queue: ReadonlyArray<string>) {
  const agent = makeAgentUiState("my-team:general-1", { queue });
  return makeTuiState({
    teamId: "my-team",
    agents: new Map([[agent.agentId, agent]]),
    focusedAgentId: agent.agentId,
  });
}

describe("QueuedPrompts", () => {
  test("renders one dim line per queued prompt", () => {
    stateStore.getState.mockReturnValue(stateWithQueue(["first", "second"]));
    const component = new QueuedPrompts(stateStore);
    expect(component.render(80)).toEqual([
      "\x1b[90mQueued: first\x1b[39m",
      "\x1b[90mQueued: second\x1b[39m",
    ]);
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
    stateStore.getState.mockReturnValue(stateWithQueue(["x".repeat(300)]));
    const component = new QueuedPrompts(stateStore);
    for (const width of [13, 40, 80]) {
      for (const line of component.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
