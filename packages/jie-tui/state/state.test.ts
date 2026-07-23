import { Events } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type StateStore } from ".";
import { StateStoreImpl } from "./state-store";

function loadDemoTeam(stateStore: StateStore): void {
  stateStore.dispatch(
    Actions.receiveEvent(
      Events.teamLoaded({ kind: "system" }, {
        id: "demo",
        leaderKey: "general-1",
        history: [],
        agents: [
          { teamId: "demo", role: "helper", agentKey: "helper-1", isLeader: false, model: null },
          { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null },
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

  test("reflects focus changes from Actions.switchCycleAgent", () => {
    const store = new StateStoreImpl();
    loadDemoTeam(store);
    store.dispatch(Actions.switchCycleAgent(1));
    const focused = TuiState.getFocusedAgent(store.getState());
    expect(focused?.agentKey).toBe("helper-1");
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
        Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" }),
      ),
    );
    expect(TuiState.isBusy(store.getState())).toBe(true);
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
