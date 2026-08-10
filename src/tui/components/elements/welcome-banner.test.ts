import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type AgentUiState, type MessageTurn, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { WelcomeBanner } from "./welcome-banner";

const LEADER_ID: AgentId = "my-team:general-1";
const QA_ID: AgentId = "my-team:qa-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("WelcomeBanner", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders the mark, the gloss and the tagline while there is no conversation", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("界");
    expect(text).toContain("(jiè)");
    expect(text).toContain("native multi-agent coding");
  });

  test("renders the installed teams once the platform reported them, loaded team first", () => {
    stateStore.getState.mockReturnValue(stateWithInstalledTeams());
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("Teams: solo(1) · my-team(2)");
  });

  test("omits the teams line when no team is installed", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("Teams:");
  });

  test("omits the roster even when a team is loaded — the team strip shows it", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("general-1");
    expect(text).not.toContain("gpt-4o");
  });

  test("shows the version next to the mark", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ version: "1.2.3" }));
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("v1.2.3");
    expect(text).toContain("界 (jiè)");
  });

  test("shows no version suffix when the version is unknown", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toMatch(/v\d/);
    expect(text).toContain("界 (jiè)");
  });

  test("shows a hint to call /help instead of the command and shortcut list", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("/help to show commands and shortcuts");
    expect(text).not.toContain("Commands");
    expect(text).not.toContain("Shortcuts");
  });

  test("renders the identity without the ASCII art mark", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("█");
    expect(text).toContain("界");
  });

  test("headings carry no rule line", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("─");
  });

  test("colors the mark in accent and the /help hint in accent and muted", () => {
    const lines = new WelcomeBanner(stateStore).render(80);
    expect(lines.some((line) => line.startsWith("\x1b[36m") && stripAnsi(line).includes("界"))).toBe(true);
    expect(lines.some((line) => line.includes("\x1b[36m/help\x1b[39m"))).toBe(true);
  });

  test("hides the banner once a turn is in progress", () => {
    stateStore.getState.mockReturnValue(stateWithTurn());
    expect(new WelcomeBanner(stateStore).render(80)).toEqual([]);
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

describe("WelcomeBanner.update", () => {
  test("reports dirty when chat content appears", () => {
    stateStore.getState.mockReturnValue(makeTuiState());
    const banner = new WelcomeBanner(stateStore);
    banner.update();
    stateStore.getState.mockReturnValue(stateWithTurn());
    expect(banner.update()).toBe(true);
  });

  test("reports dirty when version changes", () => {
    const agents = new Map();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, version: "1.0.0" }));
    const banner = new WelcomeBanner(stateStore);
    banner.update();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, version: "2.0.0" }));
    expect(banner.update()).toBe(true);
  });

  test("reports dirty when installed teams change", () => {
    const agents = new Map();
    const teams = [{ id: "solo", agentCount: 1, location: "builtin" as const }];
    stateStore.getState.mockReturnValue(makeTuiState({ agents }));
    const banner = new WelcomeBanner(stateStore);
    banner.update();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, installedTeams: teams }));
    expect(banner.update()).toBe(true);
  });

  test("reports dirty when teamId changes", () => {
    const agents = new Map();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, teamId: "solo" }));
    const banner = new WelcomeBanner(stateStore);
    banner.update();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, teamId: "my-team" }));
    expect(banner.update()).toBe(true);
  });

  test("reports clean when the watched slice is unchanged", () => {
    const state = stateWithInstalledTeams();
    stateStore.getState.mockReturnValue(state);
    const banner = new WelcomeBanner(stateStore);
    expect(banner.update()).toBe(true);
    expect(banner.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    const agents = new Map();
    stateStore.getState.mockReturnValue(makeTuiState({ agents }));
    const banner = new WelcomeBanner(stateStore);
    banner.update();
    stateStore.getState.mockReturnValue(makeTuiState({ agents, kanbanView: "list" }));
    expect(banner.update()).toBe(false);
  });
});

function stateWithInstalledTeams(): TuiState {
  return makeTuiState({
    teamId: "solo",
    installedTeams: [
      { id: "my-team", agentCount: 2, location: "user" },
      { id: "solo", agentCount: 1, location: "builtin" },
    ],
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
  return { userPrompt: "q", cards: [], blocks: [], streamId: 1, seq: 0 };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
