import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { Footer } from "./footer";

const LEADER_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("Footer", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders two lines: identity with cwd/branch left and team:agent right", () => {
    stateStore.getState.mockReturnValue(seededState(false));
    const lines = new Footer(stateStore).render(80);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("/repo (dev)");
    expect(lines[0]).toContain("my-team:general-1");
  });

  test("marks a dirty worktree with a star after the branch", () => {
    stateStore.getState.mockReturnValue(seededState(true));
    const lines = new Footer(stateStore).render(80);
    expect(lines[0]).toContain("(dev*)");
  });

  test("falls back to main when no branch is known and to no-team without a team", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ cwd: "/repo", gitBranch: "" }));
    const lines = new Footer(stateStore).render(80);
    expect(lines[0]).toContain("/repo (main)");
    expect(lines[0]).toContain("no-team:—");
  });

  test("line two reports placeholders when no model is assigned", () => {
    stateStore.getState.mockReturnValue(seededState(false));
    const lines = new Footer(stateStore).render(80);
    expect(lines[1]).toContain("—");
  });

  test("line two keeps context on the left and right-aligns the model segment at the right edge", () => {
    stateStore.getState.mockReturnValue(seededStateWithModel());
    const lines = new Footer(stateStore).render(80);
    const plain = stripAnsi(lines[1]);
    expect(visibleWidth(lines[1])).toBe(80);
    expect(plain.endsWith("(anthropic) claude-opus-4 | high")).toBe(true);
    expect(plain).toMatch(/\S {2,}\(anthropic\) claude-opus-4 \| high$/);
    expect(plain.trimStart().startsWith("(anthropic)")).toBe(false);
  });

  test("every line fits the given width", () => {
    stateStore.getState.mockReturnValue(seededState(true));
    const lines = new Footer(stateStore).render(60);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(60);
    }
  });

  test("never renders a line wider than the given width with over-long identity (doRender guard)", () => {
    stateStore.getState.mockReturnValue(seededStateWithLongIdentity());
    const footer = new Footer(stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of footer.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function seededState(dirty: boolean): TuiState {
  return makeTuiState({
    cwd: "/repo",
    gitBranch: "dev",
    gitDirty: dirty,
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true })]]),
  });
}

function seededStateWithModel(): TuiState {
  const model = { provider: "anthropic", id: "claude-opus-4", effort: "high", contextWindow: null } as const;
  return makeTuiState({
    cwd: "/repo",
    gitBranch: "dev",
    gitDirty: false,
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, model })]]),
  });
}

function seededStateWithLongIdentity(): TuiState {
  const longText = "x".repeat(300);
  const model = { provider: "provider", id: "y".repeat(300), effort: "high", contextWindow: null } as const;
  const agents = new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, model })]]);
  return makeTuiState({
    cwd: `/${longText}`,
    gitBranch: "中文🎉".repeat(40),
    gitDirty: true,
    teamId: longText,
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents,
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
