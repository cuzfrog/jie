import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type MessageTurn, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import { KeyHints } from "./key-hints";

const LEADER_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("KeyHints", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders hint lines while there is no conversation", () => {
    const text = new KeyHints(stateStore).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("enter send");
    expect(text).toContain("tab complete");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+d quit");
  });

  test("still shows the hints once a team is loaded but idle", () => {
    stateStore.getState.mockReturnValue(stateWithTeam());
    const lines = new KeyHints(stateStore).render(200);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map(stripAnsi).join("\n")).toContain("enter send");
  });

  test("hides the hints once a turn is in progress", () => {
    stateStore.getState.mockReturnValue(stateWithTurn());
    expect(new KeyHints(stateStore).render(200)).toEqual([]);
  });

  test("lays the hints out on a single line when the width is ample", () => {
    expect(new KeyHints(stateStore).render(300).length).toBe(1);
  });

  test("wraps the hints across more lines as the width narrows", () => {
    const wide = new KeyHints(stateStore).render(300).length;
    const narrow = new KeyHints(stateStore).render(60).length;
    expect(narrow).toBeGreaterThan(wide);
  });

  test("every hint line fits the given width", () => {
    const hints = new KeyHints(stateStore);
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of hints.render(width)) {
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

function stateWithTurn(): TuiState {
  const currentTurn: MessageTurn = { userPrompt: "q", cards: [], blocks: [], streamId: 1 };
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, currentTurn })]]),
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
