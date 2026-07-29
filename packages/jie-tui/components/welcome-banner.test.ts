import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type AgentUiState, type MessageTurn, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import { WelcomeBanner, welcomeLines } from "./welcome-banner";

const LEADER_ID: AgentId = "my-team:general-1";
const QA_ID: AgentId = "my-team:qa-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("WelcomeBanner", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders the jie mark, the wordmark and the gloss while there is no conversation", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("█▀▀▀▀█▀▀▀▀█");
    expect(text).toContain("jie");
    expect(text).toContain("multi-agent");
    expect(text).toContain("界");
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

  test("shows a Team section with the roster table without the ctx column", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("general-1 leader");
    expect(text).toContain("qa-1");
    expect(text).toContain("gpt-4o");
    expect(text).not.toContain("ctx");
  });

  test("omits the Team section when no roster is loaded", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ installedTeams: [{ id: "my-team", agentCount: 2 }] }));
    const lines = new WelcomeBanner(stateStore).render(80).map(stripAnsi);
    expect(lines.some((line) => line.includes("Teams: "))).toBe(true);
    expect(lines).not.toContain("Team");
  });

  test("shows the version next to the wordmark", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ version: "1.2.3" }));
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("jie v1.2.3");
  });

  test("shows no version suffix when the version is unknown", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("jie v");
  });

  test("shows a Commands section with every command, argument hint and description", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("Commands");
    const commands = [
      "/help", "/clear", "/exit", "/team", "/resume", "/rename", "/model", "/model-filter", "/effort", "/login", "/logout",
    ];
    for (const command of commands) {
      expect(text).toContain(command);
    }
    expect(text).toContain("<provider> <apiKey>");
    expect(text).toContain("resume a session of the loaded team");
  });

  test("lays the commands out in one column at 80 columns", () => {
    const lines = new WelcomeBanner(stateStore).render(80).map(stripAnsi);
    expect(lines).toContain("  /login <provider> <apiKey>  store a provider API key");
    expect(lines).toContain("  /resume <sessionId>  resume a session of the loaded team");
  });

  test("lays the commands out in two columns when the width allows", () => {
    const lines = new WelcomeBanner(stateStore).render(120).map(stripAnsi);
    const paired = lines.filter((line) => line.includes("/help") && line.includes("/model-filter"));
    expect(paired.length).toBe(1);
    expect(paired[0]).toContain("show this help");
    expect(paired[0]).toContain("filter the /model list");
  });

  test("hides the mark when the width cannot fit it beside the identity", () => {
    const narrow = new WelcomeBanner(stateStore).render(65).map(stripAnsi).join("\n");
    expect(narrow).not.toContain("█");
    expect(narrow).toContain("jie");
    const ample = new WelcomeBanner(stateStore).render(66).map(stripAnsi).join("\n");
    expect(ample).toContain("█▀▀▀▀█▀▀▀▀█");
  });

  test("shows a Shortcuts section with the core keybindings", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).toContain("Shortcuts");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+d quit");
  });

  test("headings carry no rule line", () => {
    const text = new WelcomeBanner(stateStore).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("─");
  });

  test("colors the mark in accent and the argument hints in warning", () => {
    const lines = new WelcomeBanner(stateStore).render(80);
    expect(lines.some((line) => line.startsWith("\x1b[36m") && stripAnsi(line).includes("█"))).toBe(true);
    expect(lines.some((line) => line.includes("\x1b[33m<provider> <apiKey>\x1b[39m"))).toBe(true);
  });

  test("the splash renders exactly the full /help content", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    expect(new WelcomeBanner(stateStore).render(80)).toEqual(welcomeLines(stateStore.getState(), 80));
  });

  test("hides the banner once a turn is in progress", () => {
    stateStore.getState.mockReturnValue(stateWithTurn());
    expect(new WelcomeBanner(stateStore).render(80)).toEqual([]);
  });

  test("hides the banner once the help info was reprinted into the chat", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ infoEntries: [{ seq: 0, kind: "help" }], nextEntrySeq: 1 }));
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

  test("every full-help line fits the given width", () => {
    stateStore.getState.mockReturnValue(stateWithTeamAndModel());
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of welcomeLines(stateStore.getState(), width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stateWithInstalledTeams(): TuiState {
  return makeTuiState({
    teamId: "solo",
    installedTeams: [
      { id: "my-team", agentCount: 2 },
      { id: "solo", agentCount: 1 },
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
