import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type InfoEntry, type StateStore } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { InfoMessage } from "./info-message";

const LEADER_ID: AgentId = "my-team:general-1";
const HELP: InfoEntry = { seq: 0, kind: "help" };

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("InfoMessage", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("a help entry reprints the wordmark and the tagline", () => {
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("jie");
    expect(text).toContain("multi-agent");
  });

  test("a help entry shows the team line once a team is loaded", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      teamId: "my-team",
      leaderAgentId: LEADER_ID,
      agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true })]]),
    }));
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("team my-team");
    expect(text).toContain("general-1 (leader)");
  });

  test("a help entry reprints the key hints", () => {
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+d quit");
  });

  test("a help entry lists every slash command including /resume", () => {
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    for (const command of ["/help", "/clear", "/exit", "/team", "/resume", "/rename", "/model", "/effort", "/login", "/logout"]) {
      expect(text).toContain(command);
    }
  });

  test("a help entry shows argument hints and descriptions under a COMMANDS heading", () => {
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("COMMANDS");
    expect(text).toContain("<provider> <apiKey>");
    expect(text).toContain("resume a session of the loaded team");
  });

  test("a help entry shows the key hints under a KEYS heading", () => {
    const text = new InfoMessage(stateStore, HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("KEYS");
    expect(text).toContain("enter send");
  });

  test("every help line fits the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      teamId: "my-team",
      leaderAgentId: LEADER_ID,
      agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true })]]),
    }));
    const info = new InfoMessage(stateStore, HELP);
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of info.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
