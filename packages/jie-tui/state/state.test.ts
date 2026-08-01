import { Events } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type StateStore } from ".";
import { StateStoreImpl } from "./state-store";

function loadDemoTeam(stateStore: StateStore): void {
  stateStore.dispatch(
    Actions.receiveEvent(
      Events.teamLoaded({ kind: "system" }, {
        id: "demo",
        leaderKey: "general-1",
        sessionName: null,
        history: [],
        agents: [
          { teamId: "demo", role: "helper", agentKey: "helper-1", isLeader: false, tools: [], subscribe: [], model: null },
          { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], model: null },
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

  test("returns true with only an info entry and no conversation", () => {
    const store = new StateStoreImpl();
    store.dispatch(Actions.showHelp());
    expect(TuiState.hasChatContent(store.getState())).toBe(true);
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
