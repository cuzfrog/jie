import { Events } from "@cuzfrog/jie-platform";
import { Actions } from "./actions";
import type { TuiState } from "./state";
import { StateStoreImpl } from "./state-store";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";

const INITIAL_TUI_STATE = new StateStoreImpl().getState();

const SYSTEM_SENDER: Parameters<typeof Events.teamLoaded>[0] = { kind: "system" };

function loadedTeam(roles: ReadonlyArray<{ role: string; agent_key: string; is_leader: boolean }>): TuiState {
  const agents = roles.map((r) => ({
    teamId: "my-team",
    role: r.role,
    agentKey: r.agent_key,
    isLeader: r.is_leader,
    model: null,
  }));
  const leaderKey = agents.find((a) => a.isLeader)?.agentKey ?? agents[0]?.agentKey ?? "general-1";
  return reduceEvent(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey,
    history: [],
    agents,
  }));
}

describe("toggleThinking", () => {
  test("toggles thinkingExpanded on each call", () => {
    const state1 = reduceUiAction(INITIAL_TUI_STATE, Actions.toggleThinking());
    const state2 = reduceUiAction(state1, Actions.toggleThinking());
    expect(state1.thinkingExpanded).toBe(true);
    expect(state2.thinkingExpanded).toBe(false);
  });

  test("starts as false in initial state", () => {
    expect(INITIAL_TUI_STATE.thinkingExpanded).toBe(false);
  });
});

describe("toggleToolCards", () => {
  test("toggles toolCardsExpanded on each call", () => {
    const state1 = reduceUiAction(INITIAL_TUI_STATE, Actions.toggleToolCards());
    const state2 = reduceUiAction(state1, Actions.toggleToolCards());
    expect(state1.toolCardsExpanded).toBe(true);
    expect(state2.toolCardsExpanded).toBe(false);
  });

  test("starts as false in initial state", () => {
    expect(INITIAL_TUI_STATE.toolCardsExpanded).toBe(false);
  });
});

describe("cycleAgent", () => {
  function multiAgent(): TuiState {
    return loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
  }

  test("direction=1 cycles forward", () => {
    const state1 = multiAgent();
    expect(state1.focusedAgentId).toBe("my-team:manager-1");
    const state2 = reduceUiAction(state1, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("direction=-1 cycles backward and wraps to the last agent", () => {
    const state1 = multiAgent();
    const state2 = reduceUiAction(state1, Actions.switchCycleAgent(-1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("is a no-op when only one agent is present", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:general-1");
  });

  test("direction=1 from no focused agent lands on the first agent", () => {
    const state = { ...multiAgent(), focusedAgentId: null };
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("direction=-1 from no focused agent lands on the last agent", () => {
    const state = { ...multiAgent(), focusedAgentId: null };
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });
});

describe("transient", () => {
  test("sets transientMessage text", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.setTransientMessage("logged in to nvidia"));
    expect(state.transientMessage).toBe("logged in to nvidia");
  });

  test("clearTransientMessage nulls transientMessage", () => {
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.setTransientMessage("x"));
    const state1 = reduceUiAction(state0, Actions.clearTransientMessage());
    expect(state1.transientMessage).toBeNull();
  });
});

describe("error", () => {
  test("sets errorBanner; clearErrorMessage nulls it", () => {
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.setErrorMessage("No model selected"));
    expect(state0.errorBanner).toBe("No model selected");
    const state1 = reduceUiAction(state0, Actions.clearErrorMessage());
    expect(state1.errorBanner).toBeNull();
  });
});

describe("pendingQuit", () => {
  test("requestQuit sets the flag; second requestQuit is a no-op", () => {
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.requestQuit());
    expect(state0.pendingQuit).toBe(true);
    const state1 = reduceUiAction(state0, Actions.requestQuit());
    expect(state1).toBe(state0);
  });

  test("clearTuiState does not touch pendingQuit", () => {
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.requestQuit());
    const state1 = reduceUiAction(state0, Actions.clearTuiState());
    expect(state1.pendingQuit).toBe(true);
  });
});

describe("clear", () => {
  test("resets agents, transient, and error", () => {
    let state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    state = reduceUiAction(state, Actions.setErrorMessage("e"));
    state = reduceUiAction(state, Actions.setTransientMessage("t"));
    const cleared = reduceUiAction(state, Actions.clearTuiState());
    expect(cleared.agents.size).toBe(0);
    expect(cleared.leaderAgentId).toBeNull();
    expect(cleared.focusedAgentId).toBeNull();
    expect(cleared.transientMessage).toBeNull();
    expect(cleared.errorBanner).toBeNull();
  });
});

