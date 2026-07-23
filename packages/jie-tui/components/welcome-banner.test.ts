import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type AgentUiState, type MessageTurn, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import { WelcomeBanner } from "./welcome-banner";

const LEADER_ID: AgentId = "my-team:general-1";
const QA_ID: AgentId = "my-team:qa-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("WelcomeBanner", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders the wordmark and the tagline while there is no conversation", () => {
    const text = new WelcomeBanner(stateStore).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("jie");
    expect(text).toContain("multi-agent");
  });

  test("renders the team line with the leader mark once a team is loaded", () => {
    stateStore.getState.mockReturnValue(stateWithTeam());
    const text = new WelcomeBanner(stateStore).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("team my-team");
    expect(text).toContain("general-1 (leader)");
  });

  test("shows each agent's model on the roster", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    const text = new WelcomeBanner(stateStore).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("general-1 (leader)");
    expect(text).toContain("qa-1");
    expect(text).toContain("openai/gpt-4o");
  });

  test("hides the banner once a turn is in progress", () => {
    stateStore.getState.mockReturnValue(stateWithTurn());
    expect(new WelcomeBanner(stateStore).render(200)).toEqual([]);
  });

  test("every banner line fits the given width", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    const banner = new WelcomeBanner(stateStore);
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of banner.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stateWithTeam(): TuiState {
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true })]]),
  });
}

function stateWithTeamAndModel(): TuiState {
  const agents = new Map<AgentId, AgentUiState>([
    [LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true })],
    [QA_ID, makeAgentUiState(QA_ID, {
      role: "qa",
      model: { provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null },
    })],
  ]);
  return makeTuiState({ teamId: "my-team", leaderAgentId: LEADER_ID, agents });
}

function stateWithTurn(): TuiState {
  const currentTurn = makeTurn();
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, currentTurn })]]),
  });
}

function makeTurn(): MessageTurn {
  return { userPrompt: "q", cards: [], blocks: [], streamId: 1 };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
