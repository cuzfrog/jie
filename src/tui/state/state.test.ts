import { Events } from "../../platform";
import { Actions, TuiState, type StateStore } from ".";
import { StateStoreImpl } from "./state-store";

function loadDemoTeam(stateStore: StateStore): void {
  stateStore.dispatch(
    Actions.receiveEvent(
      Events.teamLoaded({ kind: "system" }, {
        id: "demo",
        leaderKey: "general-1",
        sessionName: null,
        currentSessionId: null,
        kanbanCards: [],
        history: [],
        agents: [
          { teamId: "demo", role: "helper", agentKey: "helper-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
          { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
        ],
      }),
    ),
  );
}

describe("TuiState.getFocusedAgent", () => {
  test("returns null when no team is loaded", () => {
    const store = new StateStoreImpl();
    expect(TuiState.getFocusedAgent(store.getState())).toBeNull();
  });

  test("returns the leader agent after a team is loaded", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    const focused = TuiState.getFocusedAgent(store.getState());
    expect(focused).not.toBeNull();
    expect(focused?.agentKey).toBe("general-1");
    expect(focused?.isLeader).toBe(true);
  });

  test("reflects focus changes only after the team cursor is committed", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.toggleTeamPanel());
    store.dispatch(Actions.switchCycleAgent(1));
    expect(TuiState.getFocusedAgent(store.getState())?.agentKey).toBe("general-1");
    store.dispatch(Actions.commitTeamCursor());
    expect(TuiState.getFocusedAgent(store.getState())?.agentKey).toBe("helper-1");
  });
});

describe("TuiState.rosterOrder", () => {
  test("is empty when no team is loaded", () => {
    const store = new StateStoreImpl();
    expect(TuiState.rosterOrder(store.getState())).toEqual([]);
  });

  test("puts the leader first even when it is not first in the payload", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    const keys = TuiState.rosterOrder(store.getState()).map((agent) => agent.agentKey);
    expect(keys).toEqual(["general-1", "helper-1"]);
  });
});

describe("TuiState.isBusy", () => {
  test("returns false with no agents", () => {
    const store = new StateStoreImpl();
    expect(TuiState.isBusy(store.getState())).toBe(false);
  });

  test("returns false when all agents are idle", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    expect(TuiState.isBusy(store.getState())).toBe(false);
  });

  test("returns true once any agent enters busy", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(
      Actions.receiveEvent(
        Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" }, null),
      ),
    );
    expect(TuiState.isBusy(store.getState())).toBe(true);
  });
});

describe("TuiState.workingKind", () => {
  test("returns none when no team is loaded", () => {
    const store = new StateStoreImpl();
    expect(TuiState.workingKind(store.getState())).toBe("none");
  });

  test("returns none when all agents are idle", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    expect(TuiState.workingKind(store.getState())).toBe("none");
  });

  test("returns focused when the focused agent is busy", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" }, null)));
    expect(TuiState.workingKind(store.getState())).toBe("focused");
  });

  test("returns team when only an unfocused agent is busy", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "helper-1" }, null)));
    expect(TuiState.workingKind(store.getState())).toBe("team");
  });

  test("returns focused when the focused agent is busy alongside another agent", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "helper-1" }, null)));
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" }, null)));
    expect(TuiState.workingKind(store.getState())).toBe("focused");
  });

  test("tracks the focus when the team cursor is committed", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "helper-1" }, null)));
    expect(TuiState.workingKind(store.getState())).toBe("team");
    store.dispatch(Actions.toggleTeamPanel());
    store.dispatch(Actions.switchCycleAgent(1));
    store.dispatch(Actions.commitTeamCursor());
    expect(TuiState.workingKind(store.getState())).toBe("focused");
  });
});

describe("TuiState.isInterrupted", () => {
  test("returns false on the initial state", () => {
    const store = new StateStoreImpl();
    expect(TuiState.isInterrupted(store.getState())).toBe(false);
  });

  test("returns true once the focused agent idles aborted", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "aborted")));
    expect(TuiState.isInterrupted(store.getState())).toBe(true);
  });

  test("returns false after the next submit", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "aborted")));
    store.dispatch(Actions.submitEditorText("again"));
    expect(TuiState.isInterrupted(store.getState())).toBe(false);
  });
});

describe("TuiState.hasChatContent", () => {
  test("returns false on the initial state", () => {
    const store = new StateStoreImpl();
    expect(TuiState.hasChatContent(store.getState())).toBe(false);
  });

  test("returns true once an agent has a current turn", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" }, null)));
    expect(TuiState.hasChatContent(store.getState())).toBe(true);
  });
});

describe("TuiState.isIdleAttentionNeeded", () => {
  const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;

  test("returns false when no team is loaded", () => {
    const store = new StateStoreImpl();
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(false);
  });

  test("returns true when the focused agent idles after stop", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(true);
  });

  test("returns false for non-ringable stop reasons", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "toolUse")));
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(false);
  });

  test("returns false once the focused agent starts a new turn", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, "again")));
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(false);
  });

  test("returns false when the focused agent idles while the terminal is already focused", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.terminalFocusGained());
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(false);
  });

  test("returns false after the user focuses the terminal", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(true);
    store.dispatch(Actions.terminalFocusGained());
    expect(TuiState.isIdleAttentionNeeded(store.getState())).toBe(false);
  });
});

describe("TuiState.isUserInputNeeded", () => {
  const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;

  test("returns false when no question is pending", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    expect(TuiState.isUserInputNeeded(store.getState())).toBe(false);
  });

  test("returns true when the focused agent is asked a question", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentQuestionAsk(sender, "req-1", [])));
    expect(TuiState.isUserInputNeeded(store.getState())).toBe(true);
  });

  test("returns true when a non-focused agent is asked a question", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    const other = { kind: "agent", teamId: "demo", agentKey: "helper-1" } as const;
    store.dispatch(Actions.receiveEvent(Events.agentQuestionAsk(other, "req-1", [])));
    expect(TuiState.isUserInputNeeded(store.getState())).toBe(true);
  });

  test("returns false once the question is answered", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentQuestionAsk(sender, "req-1", [])));
    store.dispatch(Actions.submitQuestionAnswers("req-1", []));
    expect(TuiState.isUserInputNeeded(store.getState())).toBe(false);
  });
});

describe("TuiState.anyAgentThinking", () => {
  const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;

  test("returns false on the initial state", () => {
    const store = new StateStoreImpl();
    expect(TuiState.anyAgentThinking(store.getState())).toBe(false);
  });

  test("returns false when agents are idle", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    expect(TuiState.anyAgentThinking(store.getState())).toBe(false);
  });

  test("returns true while a thinking block is streaming without a duration", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, 1, 0, "thinking", "pondering")));
    expect(TuiState.anyAgentThinking(store.getState())).toBe(true);
  });

  test("returns false once the thinking block is stamped with a duration", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, 1, 0, "thinking", "pondering")));
    store.dispatch(Actions.receiveEvent(Events.agentStreamEnd(sender, 1, 1, [300])));
    expect(TuiState.anyAgentThinking(store.getState())).toBe(false);
  });

  test("returns false for an empty thinking block", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender, null)));
    store.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, 1, 0, "thinking", "")));
    expect(TuiState.anyAgentThinking(store.getState())).toBe(false);
  });
});

describe("TuiState.kanbanVisibleCards", () => {
  test("returns the whole board when every column fits", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.setKanbanBoard([
      { id: "P1", content: "P1", status: "pending" },
      { id: "I1", content: "I1", status: "in_progress" },
      { id: "C1", content: "C1", status: "completed" },
    ]));
    expect(TuiState.kanbanVisibleCards(store.getState()).map((card) => card.id)).toEqual(["P1", "I1", "C1"]);
  });

  test("caps each status column at 8 rows, independently per status", () => {
    const store = new StateStoreImpl();
    const pending = Array.from({ length: 10 }, (_, index) => ({ id: `P${index + 1}`, content: `P${index + 1}`, status: "pending" as const }));
    const inProgress = Array.from({ length: 9 }, (_, index) => ({ id: `I${index + 1}`, content: `I${index + 1}`, status: "in_progress" as const }));
    store.dispatch(Actions.setKanbanBoard([...pending, ...inProgress]));
    const visible = TuiState.kanbanVisibleCards(store.getState());
    expect(visible.filter((card) => card.status === "pending")).toHaveLength(8);
    expect(visible.filter((card) => card.status === "in_progress")).toHaveLength(8);
    expect(visible.filter((card) => card.status === "pending").map((card) => card.id)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
  });

  test("keeps the board order", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.setKanbanBoard([
      { id: "I1", content: "I1", status: "in_progress" },
      { id: "P1", content: "P1", status: "pending" },
      { id: "I2", content: "I2", status: "in_progress" },
    ]));
    expect(TuiState.kanbanVisibleCards(store.getState()).map((card) => card.id)).toEqual(["I1", "P1", "I2"]);
  });
});

describe("TuiState.shouldShowErrorBanner", () => {
  test("returns false when errorBanner is null", () => {
    const store = new StateStoreImpl();
    expect(TuiState.shouldShowErrorBanner(store.getState())).toBe(false);
  });

  test("returns false when errorBanner is the empty string", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.setErrorMessage(""));
    expect(TuiState.shouldShowErrorBanner(store.getState())).toBe(false);
  });

  test("returns true once setErrorMessage is dispatched", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.setErrorMessage("boom"));
    expect(TuiState.shouldShowErrorBanner(store.getState())).toBe(true);
  });

  test("returns false again after clearBanners is dispatched", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.setErrorMessage("boom"));
    store.dispatch(Actions.clearBanners());
    expect(TuiState.shouldShowErrorBanner(store.getState())).toBe(false);
  });
});
