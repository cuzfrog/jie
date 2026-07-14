import { Events } from "@cuzfrog/jie-platform";
import { Actions } from "./actions";
import type { TuiState } from "./state";
import { createStateStore } from "./state-store";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";

const INITIAL_TUI_STATE = createStateStore().getState();

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
    agents,
  }));
}

describe("toggleRail", () => {
  test("toggles showTeamRailPanel on each call", () => {
    const state1 = reduceUiAction(INITIAL_TUI_STATE, Actions.toggleTeamRail());
    const state2 = reduceUiAction(state1, Actions.toggleTeamRail());
    expect(state1.showTeamRailPanel).toBe(true);
    expect(state2.showTeamRailPanel).toBe(false);
  });
});

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
  function multiAgentRail(): TuiState {
    const state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    return reduceUiAction(state, Actions.toggleTeamRail());
  }

  test("direction=1 cycles forward", () => {
    const state1 = multiAgentRail();
    expect(state1.focusedAgentId).toBe("my-team:manager-1");
    const state2 = reduceUiAction(state1, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("direction=-1 cycles backward and wraps to the last agent", () => {
    const state1 = multiAgentRail();
    const state2 = reduceUiAction(state1, Actions.switchCycleAgent(-1));
    expect(state2.focusedAgentId).toBe("my-team:worker-1");
  });

  test("is a no-op when the rail is hidden", () => {
    const state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    expect(state.showTeamRailPanel).toBe(false);
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("is a no-op when only one agent is present", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const state2 = reduceUiAction(reduceUiAction(state, Actions.toggleTeamRail()), Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:general-1");
  });

  test("direction=1 from no focused agent lands on the first agent", () => {
    let state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    state = reduceUiAction(state, Actions.toggleTeamRail());
    state = { ...state, focusedAgentId: null };
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("direction=-1 from no focused agent lands on the last agent", () => {
    let state = loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    state = reduceUiAction(state, Actions.toggleTeamRail());
    state = { ...state, focusedAgentId: null };
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

  test("resets session picker state too", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([{ sessionId: "s1", messageCount: 1, lastActivity: "2026-07-14T00:00:00.000Z" }]));
    state = reduceUiAction(state, Actions.setPickerQuery("alpha"));
    state = reduceUiAction(state, Actions.focusPickerIndex(2));
    const cleared = reduceUiAction(state, Actions.clearTuiState());
    expect(cleared.sessionPickerOpen).toBe(false);
    expect(cleared.sessionPickerQuery).toBe("");
    expect(cleared.sessionPickerSessions).toEqual([]);
    expect(cleared.sessionPickerFocus).toBe(0);
  });
});

describe("sessionPicker", () => {
  test("openSessionPicker sets open=true, stores sessions, resets query and focus", () => {
    const sessions = [
      { sessionId: "s1", messageCount: 1, lastActivity: "2026-07-14T00:00:00.000Z" },
      { sessionId: "s2", messageCount: 2, lastActivity: "2026-07-14T01:00:00.000Z" },
    ];
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.openSessionPicker(sessions));
    expect(state.sessionPickerOpen).toBe(true);
    expect(state.sessionPickerSessions).toEqual(sessions);
    expect(state.sessionPickerQuery).toBe("");
    expect(state.sessionPickerFocus).toBe(0);
  });

  test("openSessionPicker clears any prior query/focus", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.setPickerQuery("leftover"));
    state = reduceUiAction(state, Actions.focusPickerIndex(3));
    state = reduceUiAction(state, Actions.openSessionPicker([{ sessionId: "s1", messageCount: 1, lastActivity: "" }]));
    expect(state.sessionPickerQuery).toBe("");
    expect(state.sessionPickerFocus).toBe(0);
  });

  test("closeSessionPicker resets all four picker fields", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([{ sessionId: "s1", messageCount: 1, lastActivity: "" }]));
    state = reduceUiAction(state, Actions.setPickerQuery("alpha"));
    state = reduceUiAction(state, Actions.focusPickerIndex(1));
    const closed = reduceUiAction(state, Actions.closeSessionPicker());
    expect(closed.sessionPickerOpen).toBe(false);
    expect(closed.sessionPickerQuery).toBe("");
    expect(closed.sessionPickerSessions).toEqual([]);
    expect(closed.sessionPickerFocus).toBe(0);
  });

  test("setPickerQuery stores the text and resets focus to 0", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([
      { sessionId: "s1", messageCount: 1, lastActivity: "" },
      { sessionId: "s2", messageCount: 2, lastActivity: "" },
    ]));
    state = reduceUiAction(state, Actions.focusPickerIndex(1));
    const updated = reduceUiAction(state, Actions.setPickerQuery("alpha"));
    expect(updated.sessionPickerQuery).toBe("alpha");
    expect(updated.sessionPickerFocus).toBe(0);
  });

  test("focusPickerIndex(+1) advances with wrap", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([
      { sessionId: "s1", messageCount: 1, lastActivity: "" },
      { sessionId: "s2", messageCount: 2, lastActivity: "" },
      { sessionId: "s3", messageCount: 3, lastActivity: "" },
    ]));
    state = reduceUiAction(state, Actions.focusPickerIndex(1));
    state = reduceUiAction(state, Actions.focusPickerIndex(1));
    expect(state.sessionPickerFocus).toBe(2);
    const wrapped = reduceUiAction(state, Actions.focusPickerIndex(1));
    expect(wrapped.sessionPickerFocus).toBe(0);
  });

  test("focusPickerIndex(-1) wraps from 0 to last", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([
      { sessionId: "s1", messageCount: 1, lastActivity: "" },
      { sessionId: "s2", messageCount: 2, lastActivity: "" },
      { sessionId: "s3", messageCount: 3, lastActivity: "" },
    ]));
    const wrapped = reduceUiAction(state, Actions.focusPickerIndex(-1));
    expect(wrapped.sessionPickerFocus).toBe(2);
  });

  test("focusPickerIndex is a no-op when there are no sessions", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.focusPickerIndex(1));
    expect(state.sessionPickerFocus).toBe(0);
  });

  test("selectPickedSession is a no-op (the side effect is via the store subscriber)", () => {
    let state = INITIAL_TUI_STATE;
    state = reduceUiAction(state, Actions.openSessionPicker([{ sessionId: "s1", messageCount: 1, lastActivity: "" }]));
    const after = reduceUiAction(state, Actions.selectPickedSession("my-team", "s1"));
    expect(after).toEqual(state);
  });
});
