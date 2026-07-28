import { Events } from "@cuzfrog/jie-platform";
import { Actions } from "./actions";
import type { AgentId, TuiState } from "./state";
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
    tools: [],
    subscribe: [],
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

describe("team strip cursor", () => {
  function twoAgent(): TuiState {
    return loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
  }

  function threeAgent(): TuiState {
    return loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
      { role: "worker", agent_key: "worker-2", is_leader: false },
    ]);
  }

  test("first press opens the strip and seeds the cursor on the focused agent", () => {
    const state1 = twoAgent();
    expect(state1.focusedAgentId).toBe("my-team:manager-1");
    const state2 = reduceUiAction(state1, Actions.switchCycleAgent(1));
    expect(state2.teamPanelVisible).toBe(true);
    expect(state2.teamCursorAgentId).toBe("my-team:manager-1");
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("first press opens the strip even with a single agent", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.teamPanelVisible).toBe(true);
    expect(state2.teamCursorAgentId).toBe("my-team:general-1");
  });

  test("is a no-op when no agents are loaded", () => {
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.switchCycleAgent(1))).toBe(INITIAL_TUI_STATE);
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.switchCycleAgent(-1))).toBe(INITIAL_TUI_STATE);
  });

  test("opening with no focus seeds the cursor on the first agent on down and the last on up", () => {
    const base = { ...twoAgent(), focusedAgentId: null };
    expect(reduceUiAction(base, Actions.switchCycleAgent(1)).teamCursorAgentId).toBe("my-team:manager-1");
    expect(reduceUiAction(base, Actions.switchCycleAgent(-1)).teamCursorAgentId).toBe("my-team:worker-1");
  });

  test("moving the cursor does not switch the focused agent", () => {
    const opened = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    const state2 = reduceUiAction(opened, Actions.switchCycleAgent(1));
    expect(state2.teamCursorAgentId).toBe("my-team:worker-1");
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("down at the last agent wraps the cursor to the first", () => {
    const opened = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    const atWorker = reduceUiAction(opened, Actions.switchCycleAgent(1));
    const wrapped = reduceUiAction(atWorker, Actions.switchCycleAgent(1));
    expect(wrapped.teamCursorAgentId).toBe("my-team:manager-1");
    expect(wrapped.teamPanelVisible).toBe(true);
  });

  test("up from a middle agent moves the cursor without closing", () => {
    let state = reduceUiAction(threeAgent(), Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-2");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
    expect(state.teamPanelVisible).toBe(true);
    expect(state.focusedAgentId).toBe("my-team:manager-1");
  });

  test("up at the first agent closes the strip and clears the cursor", () => {
    const opened = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    const closed = reduceUiAction(opened, Actions.switchCycleAgent(-1));
    expect(closed.teamPanelVisible).toBe(false);
    expect(closed.teamCursorAgentId).toBeNull();
    expect(closed.focusedAgentId).toBe("my-team:manager-1");
  });

  test("navigates in leader-first order even when the leader is not first in the payload", () => {
    let state = loadedTeam([
      { role: "worker", agent_key: "worker-1", is_leader: false },
      { role: "manager", agent_key: "manager-1", is_leader: true },
    ]);
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state.teamCursorAgentId).toBe("my-team:manager-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamCursorAgentId).toBe("my-team:manager-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamPanelVisible).toBe(false);
  });

  test("recovers a stale cursor to the first agent", () => {
    const ghost: AgentId = "my-team:ghost";
    const state = { ...twoAgent(), teamPanelVisible: true, teamCursorAgentId: ghost };
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.teamCursorAgentId).toBe("my-team:manager-1");
  });

  test("clearTuiState keeps the strip visible and clears the cursor", () => {
    let opened = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    opened = reduceUiAction(opened, Actions.switchCycleAgent(1));
    const cleared = reduceUiAction(opened, Actions.clearTuiState());
    expect(cleared.teamPanelVisible).toBe(true);
    expect(cleared.teamCursorAgentId).toBeNull();
  });
});

describe("commit team cursor", () => {
  function twoAgent(): TuiState {
    return loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
  }

  test("commit switches the focused agent to the cursor", () => {
    let state = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.commitTeamCursor());
    expect(state.focusedAgentId).toBe("my-team:worker-1");
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
  });

  test("commit is a no-op when the cursor already matches the focused agent", () => {
    const state = reduceUiAction(twoAgent(), Actions.switchCycleAgent(1));
    expect(reduceUiAction(state, Actions.commitTeamCursor())).toBe(state);
  });

  test("commit is a no-op when the strip is hidden", () => {
    const cursor: AgentId = "my-team:worker-1";
    const state = { ...twoAgent(), teamPanelVisible: false, teamCursorAgentId: cursor };
    expect(reduceUiAction(state, Actions.commitTeamCursor())).toBe(state);
  });

  test("commit clears a stale cursor without moving focus", () => {
    const ghost: AgentId = "my-team:ghost";
    const state = { ...twoAgent(), teamPanelVisible: true, teamCursorAgentId: ghost };
    const committed = reduceUiAction(state, Actions.commitTeamCursor());
    expect(committed.teamCursorAgentId).toBeNull();
    expect(committed.focusedAgentId).toBe("my-team:manager-1");
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

describe("showHelp", () => {
  test("appends a help info entry at the next seq and advances the counter", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.showHelp());
    expect(state.infoEntries).toEqual([{ seq: 0, kind: "help" }]);
    expect(state.nextEntrySeq).toBe(1);
  });

  test("a second help entry takes the following seq", () => {
    let state = reduceUiAction(INITIAL_TUI_STATE, Actions.showHelp());
    state = reduceUiAction(state, Actions.showHelp());
    expect(state.infoEntries).toEqual([{ seq: 0, kind: "help" }, { seq: 1, kind: "help" }]);
    expect(state.nextEntrySeq).toBe(2);
  });

  test("clearTuiState removes info entries and resets the counter", () => {
    let state = reduceUiAction(INITIAL_TUI_STATE, Actions.showHelp());
    state = reduceUiAction(state, Actions.clearTuiState());
    expect(state.infoEntries).toEqual([]);
    expect(state.nextEntrySeq).toBe(0);
  });
});

describe("interrupted marker", () => {
  function markedTeam(): TuiState {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    return { ...state, interruptedAgentId: "my-team:general-1" };
  }

  test("submitEditorText clears interruptedAgentId", () => {
    const state = reduceUiAction(markedTeam(), Actions.submitEditorText("next prompt"));
    expect(state.interruptedAgentId).toBeNull();
  });

  test("submitEditorText is a no-op when no marker is set", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    expect(reduceUiAction(state, Actions.submitEditorText("x"))).toBe(state);
  });

  test("clearTuiState clears interruptedAgentId", () => {
    const state = reduceUiAction(markedTeam(), Actions.clearTuiState());
    expect(state.interruptedAgentId).toBeNull();
  });
});

