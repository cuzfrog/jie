import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { type ModelSegment, type TokenUsage } from "../elements";
import { Footer } from "./footer";

const LEADER_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

const tokenUsage: TokenUsage = { format: (agent) => agent === null || agent.model === null ? "—" : "25%/128k" };
const modelSegment: ModelSegment = { format: (m) => `(${m.provider}) ${m.id} | ${m.effort}` };

describe("Footer", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders two lines: identity with cwd/branch left and team:agent right", () => {
    stateStore.getState.mockReturnValue(seededState(false));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("/repo (dev)");
    expect(lines[0]).toContain("my-team:general-1");
  });

  test("marks a dirty worktree with a star after the branch", () => {
    stateStore.getState.mockReturnValue(seededState(true));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines[0]).toContain("(dev*)");
  });

  test("falls back to main when no branch is known and to no-team without a team", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ cwd: "/repo", gitBranch: "" }));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines[0]).toContain("/repo (main)");
    expect(lines[0]).toContain("no-team:—");
  });

  test("line two reports placeholders when no model is assigned", () => {
    stateStore.getState.mockReturnValue(seededState(false));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines[1]).toContain("—");
  });

  test("renders only the identity line while the team panel is open", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ ...seededState(false), teamPanelVisible: true }));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("/repo (dev)");
    expect(lines[0]).toContain("my-team:general-1");
  });

  test("renders only the identity line while the kanban panel is open", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ ...seededState(false), kanbanView: "panel" }));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("/repo (dev)");
  });

  test("renders only the identity line while the help panel is open", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ ...seededState(false), helpPanelVisible: true }));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("/repo (dev)");
  });

  test("keeps both lines while the kanban list view is shown", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ ...seededState(false), kanbanView: "list" }));
    expect(new Footer(stateStore, tokenUsage, modelSegment).render(80).length).toBe(2);
  });

  test("keeps both lines when a panel flag is set but no team is loaded", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ teamPanelVisible: true, cwd: "/repo" }));
    expect(new Footer(stateStore, tokenUsage, modelSegment).render(80).length).toBe(2);
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanView: "panel", cwd: "/repo" }));
    expect(new Footer(stateStore, tokenUsage, modelSegment).render(80).length).toBe(2);
  });

  test("line two keeps context on the left and right-aligns the model segment at the right edge", () => {
    stateStore.getState.mockReturnValue(seededStateWithModel());
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    const plain = stripAnsi(lines[1]);
    expect(visibleWidth(lines[1])).toBe(80);
    expect(plain.endsWith("(anthropic) claude-opus-4 | high")).toBe(true);
    expect(plain).toMatch(/\S {2,}\(anthropic\) claude-opus-4 \| high$/);
    expect(plain.trimStart().startsWith("(anthropic)")).toBe(false);
  });

  test("line two shows the /help hint between the context metrics and the model", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ ...seededStateWithModel(), editorCursorAtStart: false }));
    const plain = stripAnsi(new Footer(stateStore, tokenUsage, modelSegment).render(80)[1]);
    expect(plain).toContain("/help to show commands and shortcuts");
    expect(plain.indexOf("/help to show commands and shortcuts")).toBeLessThan(plain.indexOf("(anthropic)"));
  });

  test("line two swaps the /help hint for the team panel shortcut hint while the shortcut is activated", () => {
    stateStore.getState.mockReturnValue(seededStateWithModel());
    const plain = stripAnsi(new Footer(stateStore, tokenUsage, modelSegment).render(80)[1]);
    expect(plain).toContain("← to toggle team panel");
    expect(plain).not.toContain("/help to show commands and shortcuts");
    expect(plain.indexOf("← to toggle team panel")).toBeLessThan(plain.indexOf("(anthropic)"));
  });

  test("line two keeps the /help hint before a team is loaded even with the cursor at the start", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ cwd: "/repo", editorCursorAtStart: true }));
    const plain = stripAnsi(new Footer(stateStore, tokenUsage, modelSegment).render(80)[1]);
    expect(plain).toContain("/help to show commands and shortcuts");
  });

  test("every line fits the given width", () => {
    stateStore.getState.mockReturnValue(seededState(true));
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(60);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(60);
    }
  });

  test("line two shows a Compact­ing… indicator when the focused agent is compacting", () => {
    const base = seededStateWithModel();
    const agent = base.agents.get(LEADER_ID)!;
    const model = agent.model ?? { provider: "anthropic", id: "claude-opus-4", effort: "high", contextWindow: null };
    const state = makeTuiState({
      ...base,
      agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, model, compactionInProgress: true })]]),
    });
    stateStore.getState.mockReturnValue(state);
    const lines = new Footer(stateStore, tokenUsage, modelSegment).render(80);
    expect(stripAnsi(lines[1])).toContain("Compacting...");
  });

  test("never renders a line wider than the given width with over-long identity (doRender guard)", () => {
    stateStore.getState.mockReturnValue(seededStateWithLongIdentity());
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of footer.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("Footer.update", () => {
  test("reports dirty when the focused agent changes", () => {
    stateStore.getState.mockReturnValue(seededState(false));
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    footer.update();
    stateStore.getState.mockReturnValue(seededState(false));
    expect(footer.update()).toBe(true);
  });

  test("reports dirty when the git branch changes", () => {
    const base = seededState(false);
    stateStore.getState.mockReturnValue(base);
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    footer.update();
    stateStore.getState.mockReturnValue(makeTuiState({ ...base, gitBranch: "main" }));
    expect(footer.update()).toBe(true);
  });

  test("reports dirty when the team panel visibility changes", () => {
    const base = seededState(false);
    stateStore.getState.mockReturnValue(base);
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    footer.update();
    stateStore.getState.mockReturnValue(makeTuiState({ ...base, teamPanelVisible: true }));
    expect(footer.update()).toBe(true);
  });

  test("reports dirty when the editor cursor leaves the start", () => {
    const base = seededState(false);
    stateStore.getState.mockReturnValue(base);
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    footer.update();
    stateStore.getState.mockReturnValue(makeTuiState({ ...base, editorCursorAtStart: false }));
    expect(footer.update()).toBe(true);
  });

  test("reports clean when the watched slice is unchanged", () => {
    const state = seededState(false);
    stateStore.getState.mockReturnValue(state);
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    expect(footer.update()).toBe(true);
    expect(footer.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    const base = seededState(false);
    stateStore.getState.mockReturnValue(base);
    const footer = new Footer(stateStore, tokenUsage, modelSegment);
    footer.update();
    stateStore.getState.mockReturnValue(makeTuiState({ ...base, transientMessage: "hi" }));
    expect(footer.update()).toBe(false);
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
