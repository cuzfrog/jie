import { Events } from "../../platform";
import { Actions } from "./actions";
import type { AgentId, AgentUiState, TuiState } from "./state";
import { StateStoreImpl } from "./state-store";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";
import { makeAgentUiState, makeTuiState } from "../test";

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
    skills: [],
    model: null,
    sessionUsage: null,
  }));
  const leaderKey = agents.find((a) => a.isLeader)?.agentKey ?? agents[0]?.agentKey ?? "general-1";
  return reduceEvent(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey,
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
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

describe("setThinkingExpanded", () => {
  test("sets thinkingExpanded to the provided value", () => {
    const on = reduceUiAction(INITIAL_TUI_STATE, Actions.setThinkingExpanded(true));
    expect(on.thinkingExpanded).toBe(true);
    const off = reduceUiAction(on, Actions.setThinkingExpanded(false));
    expect(off.thinkingExpanded).toBe(false);
  });
});

describe("setToolCardsExpanded", () => {
  test("sets toolCardsExpanded to the provided value", () => {
    const on = reduceUiAction(INITIAL_TUI_STATE, Actions.setToolCardsExpanded(true));
    expect(on.toolCardsExpanded).toBe(true);
    const off = reduceUiAction(on, Actions.setToolCardsExpanded(false));
    expect(off.toolCardsExpanded).toBe(false);
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

  test("toggle opens the strip and seeds the cursor on the focused agent", () => {
    const state1 = twoAgent();
    expect(state1.focusedAgentId).toBe("my-team:manager-1");
    const state2 = reduceUiAction(state1, Actions.toggleTeamPanel());
    expect(state2.teamPanelVisible).toBe(true);
    expect(state2.teamCursorAgentId).toBe("my-team:manager-1");
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("toggle opens the strip even with a single agent", () => {
    const state = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const state2 = reduceUiAction(state, Actions.toggleTeamPanel());
    expect(state2.teamPanelVisible).toBe(true);
    expect(state2.teamCursorAgentId).toBe("my-team:general-1");
  });

  test("toggle hides the shown strip and clears the cursor", () => {
    const opened = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    const moved = reduceUiAction(opened, Actions.switchCycleAgent(1));
    const closed = reduceUiAction(moved, Actions.toggleTeamPanel());
    expect(closed.teamPanelVisible).toBe(false);
    expect(closed.teamCursorAgentId).toBeNull();
    expect(closed.focusedAgentId).toBe("my-team:manager-1");
  });

  test("is a no-op when no agents are loaded", () => {
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.toggleTeamPanel())).toBe(INITIAL_TUI_STATE);
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.switchCycleAgent(1))).toBe(INITIAL_TUI_STATE);
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.switchCycleAgent(-1))).toBe(INITIAL_TUI_STATE);
  });

  test("opening with no focus seeds the cursor on the first agent", () => {
    const base = { ...twoAgent(), focusedAgentId: null };
    expect(reduceUiAction(base, Actions.toggleTeamPanel()).teamCursorAgentId).toBe("my-team:manager-1");
  });

  test("cursor movement is a no-op while the strip is hidden", () => {
    const state = twoAgent();
    expect(reduceUiAction(state, Actions.switchCycleAgent(1))).toBe(state);
    expect(reduceUiAction(state, Actions.switchCycleAgent(-1))).toBe(state);
  });

  test("moving the cursor does not switch the focused agent", () => {
    const opened = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    const state2 = reduceUiAction(opened, Actions.switchCycleAgent(1));
    expect(state2.teamCursorAgentId).toBe("my-team:worker-1");
    expect(state2.focusedAgentId).toBe("my-team:manager-1");
  });

  test("down at the last agent wraps the cursor to the first", () => {
    const opened = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    const atWorker = reduceUiAction(opened, Actions.switchCycleAgent(1));
    const wrapped = reduceUiAction(atWorker, Actions.switchCycleAgent(1));
    expect(wrapped.teamCursorAgentId).toBe("my-team:manager-1");
    expect(wrapped.teamPanelVisible).toBe(true);
  });

  test("up from a middle agent moves the cursor without closing", () => {
    let state = reduceUiAction(threeAgent(), Actions.toggleTeamPanel());
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-2");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
    expect(state.teamPanelVisible).toBe(true);
    expect(state.focusedAgentId).toBe("my-team:manager-1");
  });

  test("up at the first agent wraps the cursor to the last", () => {
    const opened = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    const wrapped = reduceUiAction(opened, Actions.switchCycleAgent(-1));
    expect(wrapped.teamPanelVisible).toBe(true);
    expect(wrapped.teamCursorAgentId).toBe("my-team:worker-1");
    expect(wrapped.focusedAgentId).toBe("my-team:manager-1");
  });

  test("navigates in leader-first order even when the leader is not first in the payload", () => {
    let state = loadedTeam([
      { role: "worker", agent_key: "worker-1", is_leader: false },
      { role: "manager", agent_key: "manager-1", is_leader: true },
    ]);
    state = reduceUiAction(state, Actions.toggleTeamPanel());
    expect(state.teamCursorAgentId).toBe("my-team:manager-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamCursorAgentId).toBe("my-team:manager-1");
    state = reduceUiAction(state, Actions.switchCycleAgent(-1));
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
  });

  test("recovers a stale cursor to the first agent", () => {
    const ghost: AgentId = "my-team:ghost";
    const state = { ...twoAgent(), teamPanelVisible: true, teamCursorAgentId: ghost };
    const state2 = reduceUiAction(state, Actions.switchCycleAgent(1));
    expect(state2.teamCursorAgentId).toBe("my-team:manager-1");
  });

});

describe("kanban view cycle", () => {
  function twoAgent(): TuiState {
    return loadedTeam([
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
  }

  test("starts hidden in initial state", () => {
    expect(INITIAL_TUI_STATE.kanban.view).toBe("hidden");
  });

  test("cycles hidden to list, list to panel, and panel back to hidden", () => {
    const list = reduceUiAction(twoAgent(), Actions.cycleKanbanView());
    expect(list.kanban.view).toBe("list");
    const panel = reduceUiAction(list, Actions.cycleKanbanView());
    expect(panel.kanban.view).toBe("panel");
    const hidden = reduceUiAction(panel, Actions.cycleKanbanView());
    expect(hidden.kanban.view).toBe("hidden");
  });

  test("moving the kanban edit field routes through the kanban reducer", () => {
    const panel = reduceUiAction(reduceUiAction(twoAgent(), Actions.cycleKanbanView()), Actions.cycleKanbanView());
    const expanded = reduceUiAction(panel, Actions.toggleKanbanExpand());
    expect(expanded.kanban.editField).toBe("content");
    const moved = reduceUiAction(expanded, Actions.moveKanbanEditField("down"));
    expect(moved.kanban.editField).toBe("description");
  });

  test("leaving the panel clears edit and expand", () => {
    const panel = reduceUiAction(reduceUiAction(twoAgent(), Actions.cycleKanbanView()), Actions.cycleKanbanView());
    const editing = reduceUiAction(panel, Actions.commitKanbanEdit("#1"));
    const expanded = reduceUiAction(editing, Actions.toggleKanbanExpand());
    const hidden = reduceUiAction(expanded, Actions.cycleKanbanView());
    expect(hidden.kanban.view).toBe("hidden");
    expect(hidden.kanban.edit).toBeNull();
    expect(hidden.kanban.expanded).toBe(false);
  });

  test("is a no-op when no agent is focused", () => {
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.cycleKanbanView())).toBe(INITIAL_TUI_STATE);
  });

  test("opening the kanban panel hides the team panel and clears its cursor", () => {
    const opened = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    const moved = reduceUiAction(opened, Actions.switchCycleAgent(1));
    const list = reduceUiAction(moved, Actions.cycleKanbanView());
    expect(list.teamPanelVisible).toBe(true);
    const panel = reduceUiAction(list, Actions.cycleKanbanView());
    expect(panel.kanban.view).toBe("panel");
    expect(panel.teamPanelVisible).toBe(false);
    expect(panel.teamCursorAgentId).toBeNull();
    expect(panel.focusedAgentId).toBe("my-team:manager-1");
  });

  test("opening the team panel hides the kanban panel and clears its edit and expand", () => {
    const panel = reduceUiAction(reduceUiAction(twoAgent(), Actions.cycleKanbanView()), Actions.cycleKanbanView());
    const editing = reduceUiAction(panel, Actions.commitKanbanEdit("#1"));
    const expanded = reduceUiAction(editing, Actions.toggleKanbanExpand());
    const team = reduceUiAction(expanded, Actions.toggleTeamPanel());
    expect(team.teamPanelVisible).toBe(true);
    expect(team.teamCursorAgentId).toBe("my-team:manager-1");
    expect(team.kanban.view).toBe("hidden");
    expect(team.kanban.edit).toBeNull();
    expect(team.kanban.expanded).toBe(false);
  });

  test("opening the team panel keeps the kanban list view", () => {
    const list = reduceUiAction(twoAgent(), Actions.cycleKanbanView());
    const team = reduceUiAction(list, Actions.toggleTeamPanel());
    expect(team.teamPanelVisible).toBe(true);
    expect(team.kanban.view).toBe("list");
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
    let state = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
    state = reduceUiAction(state, Actions.switchCycleAgent(1));
    state = reduceUiAction(state, Actions.commitTeamCursor());
    expect(state.focusedAgentId).toBe("my-team:worker-1");
    expect(state.teamCursorAgentId).toBe("my-team:worker-1");
  });

  test("commit is a no-op when the cursor already matches the focused agent", () => {
    const state = reduceUiAction(twoAgent(), Actions.toggleTeamPanel());
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
  test("sets transientMessage text and stamps the current time", () => {
    const now = 12345;
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.setTransientMessage("logged in to nvidia"));
    expect(state.transientMessage).toBe("logged in to nvidia");
    expect(state.transientSetAt).toBe(now);
    spy.mockRestore();
  });

  test("clearTransientMessage nulls transientMessage and transientSetAt", () => {
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.setTransientMessage("x"));
    const state1 = reduceUiAction(state0, Actions.clearTransientMessage());
    expect(state1.transientMessage).toBeNull();
    expect(state1.transientSetAt).toBeNull();
  });

  test("re-setting the message refreshes the timestamp", () => {
    const first = 1000;
    const second = 2000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(first);
    const state0 = reduceUiAction(INITIAL_TUI_STATE, Actions.setTransientMessage("x"));
    spy.mockReturnValue(second);
    const state1 = reduceUiAction(state0, Actions.setTransientMessage("y"));
    expect(state1.transientSetAt).toBe(second);
    spy.mockRestore();
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

});

describe("editorCursorAtStart", () => {
  test("starts as true in initial state", () => {
    expect(INITIAL_TUI_STATE.editorCursorAtStart).toBe(true);
  });

  test("setEditorCursorAtStart records whether the editor cursor sits at the buffer start", () => {
    const away = reduceUiAction(INITIAL_TUI_STATE, Actions.setEditorCursorAtStart(false));
    expect(away.editorCursorAtStart).toBe(false);
    const back = reduceUiAction(away, Actions.setEditorCursorAtStart(true));
    expect(back.editorCursorAtStart).toBe(true);
  });

});

describe("setSessionName", () => {
  test("records the active session's name", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.setSessionName("my session"));
    expect(state.sessionName).toBe("my session");
  });

});

describe("showHelp", () => {
  test("toggles the help panel on", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.showHelp());
    expect(state.helpPanelVisible).toBe(true);
  });

  test("a second showHelp toggles the panel off", () => {
    let state = reduceUiAction(INITIAL_TUI_STATE, Actions.showHelp());
    state = reduceUiAction(state, Actions.showHelp());
    expect(state.helpPanelVisible).toBe(false);
  });

  test("showing the help panel hides an open team or kanban panel", () => {
    const withTeam = loadedTeam([{ role: "general", agent_key: "general-1", is_leader: true }]);
    const withPanels = { ...withTeam, teamPanelVisible: true, teamCursorAgentId: "my-team:general-1" as AgentId, kanban: { ...withTeam.kanban, view: "panel" as const } };
    const state = reduceUiAction(withPanels, Actions.showHelp());
    expect(state.helpPanelVisible).toBe(true);
    expect(state.teamPanelVisible).toBe(false);
    expect(state.teamCursorAgentId).toBeNull();
    expect(state.kanban.view).toBe("hidden");
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

});

describe("terminal focus", () => {
  test("terminalFocusGained sets terminalFocused to true", () => {
    const state = reduceUiAction(INITIAL_TUI_STATE, Actions.terminalFocusGained());
    expect(state.terminalFocused).toBe(true);
  });

  test("terminalFocusGained is a no-op when already focused and attention is clear", () => {
    const focused = { ...INITIAL_TUI_STATE, terminalFocused: true };
    expect(reduceUiAction(focused, Actions.terminalFocusGained())).toBe(focused);
  });

  test("terminalFocusGained clears requireUserAttention", () => {
    const state = { ...INITIAL_TUI_STATE, requireUserAttention: true };
    const next = reduceUiAction(state, Actions.terminalFocusGained());
    expect(next.terminalFocused).toBe(true);
    expect(next.requireUserAttention).toBe(false);
  });

  test("terminalFocusGained clears a stale requireUserAttention even when already focused", () => {
    const state = { ...INITIAL_TUI_STATE, terminalFocused: true, requireUserAttention: true };
    const next = reduceUiAction(state, Actions.terminalFocusGained());
    expect(next.terminalFocused).toBe(true);
    expect(next.requireUserAttention).toBe(false);
  });

  test("terminalFocusLost sets terminalFocused to false", () => {
    const focused = { ...INITIAL_TUI_STATE, terminalFocused: true };
    const state = reduceUiAction(focused, Actions.terminalFocusLost());
    expect(state.terminalFocused).toBe(false);
  });

  test("terminalFocusLost is a no-op when already unfocused", () => {
    expect(reduceUiAction(INITIAL_TUI_STATE, Actions.terminalFocusLost())).toBe(INITIAL_TUI_STATE);
  });
});

