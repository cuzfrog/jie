import { Events } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createContainer, InjectionMode } from "awilix";
import { Actions, registerStateModule, type StateStore } from "../state";
import { type TuiCradle } from "../";
import { WelcomeBanner } from "./welcome-banner";

function makeStateStore(): StateStore {
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  registerStateModule(container);
  return container.cradle.stateStore;
}

const AGENT_SENDER = { kind: "agent", teamId: "my-team", agentKey: "general-1" } as const;

function emptyStore(): StateStore {
  const store = makeStateStore();
  store.dispatch(Actions.setEnvironment("/repo", "dev", false));
  return store;
}

function storeWithTeam(): StateStore {
  const store = emptyStore();
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    history: [],
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  return store;
}

function storeWithTeamAndModel(): StateStore {
  const store = emptyStore();
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    history: [],
    agents: [
      { teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null },
      {
        teamId: "my-team",
        role: "qa",
        agentKey: "qa-1",
        isLeader: false,
        model: { provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null },
      },
    ],
  })));
  return store;
}

function storeWithTurn(): StateStore {
  const store = storeWithTeam();
  store.dispatch(Actions.receiveEvent(Events.agentTurnStart(AGENT_SENDER)));
  return store;
}

describe("WelcomeBanner", () => {
  test("renders the wordmark and the tagline while there is no conversation", () => {
    const text = new WelcomeBanner(emptyStore()).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("jie");
    expect(text).toContain("multi-agent");
  });

  test("renders the team line with the leader mark once a team is loaded", () => {
    const text = new WelcomeBanner(storeWithTeam()).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("team my-team");
    expect(text).toContain("general-1 (leader)");
  });

  test("shows each agent's model on the roster", () => {
    const text = new WelcomeBanner(storeWithTeamAndModel()).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("general-1 (leader)");
    expect(text).toContain("qa-1");
    expect(text).toContain("openai/gpt-4o");
  });

  test("hides the banner once a turn is in progress", () => {
    expect(new WelcomeBanner(storeWithTurn()).render(200)).toEqual([]);
  });

  test("every banner line fits the given width", () => {
    const banner = new WelcomeBanner(storeWithTeamAndModel());
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of banner.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
