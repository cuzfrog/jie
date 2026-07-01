import { Events } from "@cuzfrog/jie-platform/event";
import { Actions } from "./actions";
import { INITIAL_TUI_STATE, type TuiState } from "./state";
import { reduce } from "./reducer";

const SYSTEM_SENDER: Parameters<typeof Events.teamLoaded>[0] = { kind: "system" };

function loadedTeam(roles: Array<{ role: string; agent_key: string; is_leader: boolean }>): TuiState {
  return reduce(INITIAL_TUI_STATE, Actions.receiveEvent(Events.teamLoaded(SYSTEM_SENDER, "my-team", roles)));
}

describe("toggleRail", () => {
  test("toggles showTeamRailPanel on each call", () => {
    const state1 = reduce(INITIAL_TUI_STATE, Actions.toggleTeamRail());
    const state2 = reduce(state1, Actions.toggleTeamRail());
    expect(state1.showTeamRailPanel).toBe(true);
    expect(state2.showTeamRailPanel).toBe(false);
  });
});

describe("cycleAgent", () => {
  function multiAgentRail(): TuiState {
    const state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    return reduce(state, Actions.toggleTeamRail());
  }

  test("direction=1 cycles forward", () => {
    const state1 = multiAgentRail();
    expect(state1.focusedAgentId).toBe("my-team:manager-1");
    const state2 = reduce(state1, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("direction=-1 cycles backward and wraps to the last agent", () => {
    const state1 = multiAgentRail();
    const state2 = reduce(state1, Actions.switchCycleAgent(-1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("is a no-op when the rail is hidden", () => {
    const state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    expect(state.showTeamRailPanel).toBe(false);
    const state2 = reduce(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("is a no-op when only one agent is present", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const state2 = reduce(reduce(state, Actions.toggleTeamRail()), Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:general-1");
  });

  test("direction=1 from no focused agent lands on the first agent", () => {
    let state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    state = reduce(state, Actions.toggleTeamRail());
    state = { ...state, focusedAgentId: null };
    const state2 = reduce(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("direction=-1 from no focused agent lands on the last agent", () => {
    let state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    state = reduce(state, Actions.toggleTeamRail());
    state = { ...state, focusedAgentId: null };
    const state2 = reduce(state, Actions.switchCycleAgent(-1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });
});

describe("transient", () => {
  test("sets transientMessage text", () => {
    const state = reduce(INITIAL_TUI_STATE, Actions.setTransientMessage("logged in to nvidia"));
    expect(state.transientMessage).toBe("logged in to nvidia");
  });

  test("clearTransientMessage nulls transientMessage", () => {
    const state0 = reduce(INITIAL_TUI_STATE, Actions.setTransientMessage("x"));
    const state1 = reduce(state0, Actions.clearTransientMessage());
    expect(state1.transientMessage).toBeNull();
  });
});

describe("error", () => {
  test("sets errorBanner; clearErrorMessage nulls it", () => {
    const state0 = reduce(INITIAL_TUI_STATE, Actions.setErrorMessage("No model selected"));
    expect(state0.errorBanner).toBe("No model selected");
    const state1 = reduce(state0, Actions.clearErrorMessage());
    expect(state1.errorBanner).toBeNull();
  });
});

describe("clear", () => {
  test("resets agents, transient, and error", () => {
    let state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    state = reduce(state, Actions.setErrorMessage("e"));
    state = reduce(state, Actions.setTransientMessage("t"));
    const cleared = reduce(state, Actions.clearTuiState());
    expect(cleared.agents.size).toBe(0);
    expect(cleared.leaderAgentId).toBeNull();
    expect(cleared.focusedAgentId).toBeNull();
    expect(cleared.transientMessage).toBeNull();
    expect(cleared.errorBanner).toBeNull();
  });
});
