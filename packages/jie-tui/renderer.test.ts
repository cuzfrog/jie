import { Events } from "@cuzfrog/jie-platform/event";
import { type TuiState, Actions, INITIAL_TUI_STATE, reduce } from "./state";
import { render } from "./renderer";

function loadSingleAgent(state: TuiState, teamId = "my-team"): TuiState {
  return reduce(state, Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, teamId, [
    { role: "general", agent_key: "general-1", is_leader: true },
  ])));
}

function loadManagerWorker(state: TuiState): TuiState {
  return reduce(state, Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "my-team", [
    { role: "manager", agent_key: "manager-1", is_leader: true },
    { role: "worker", agent_key: "worker-1", is_leader: false },
  ])));
}

const AGENT_SENDER = { kind: "agent" as const, identity: { teamId: "my-team", agentRole: "general", agentKey: "general-1" } };
const USER_SENDER = { kind: "user" as const };
const NOW = 1_700_000_000_000;

describe("render — bottom strip layout", () => {
  test("rail hidden by default; editor placeholder is shown; footer has 2 lines", () => {
    const state = loadSingleAgent(INITIAL_TUI_STATE);
    const frame = render(state, { cols: 80, rows: 30, cwd: "/tmp", branch: "main" }, NOW);
    expect(frame.lines.length).toBe(30);
    const editorLine = frame.lines.find((line) => line.startsWith("type a prompt..."));
    expect(editorLine).toBeDefined();
    expect(frame.lines.some((line) => line.includes("←← for agents"))).toBe(true);
    expect(frame.lines.some((line) => line.includes("my-team:general-1"))).toBe(true);
  });

  test("rail visible after toggleRail; rail/chat separator present", () => {
    let state = loadManagerWorker(INITIAL_TUI_STATE);
    state = reduce(state, Actions.toggleTeamRail());
    const frame = render(state, { cols: 80, rows: 30 }, NOW);
    const railRows = frame.lines.filter((line) => line.includes("★"));
    expect(railRows.length).toBeGreaterThan(0);
    expect(frame.lines.some((line) => line.includes("│"))).toBe(true);
  });

  test("error banner replaces editor placeholder when present", () => {
    let state = loadSingleAgent(INITIAL_TUI_STATE);
    state = reduce(state, Actions.setErrorMessage("No model selected", 1));
    const frame = render(state, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((line) => line.includes("[!] No model selected"))).toBe(true);
  });
});

describe("render — chat pane order (T2 fixtures)", () => {
  test("user prompt → text blocks; tool cards between prompt and text", () => {
    let state = loadSingleAgent(INITIAL_TUI_STATE);
    state = reduce(state, Actions.receiveEvent(Events.userPrompt(USER_SENDER, "my-team", "Tell me a joke", "general-1")));
    state = reduce(state, Actions.receiveEvent(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "Why did the chicken cross")));
    state = reduce(state, Actions.receiveEvent(Events.agentStreamChunk(AGENT_SENDER, 1, 2, "text", " the road?")));
    const frame = render(state, { cols: 80, rows: 30 }, NOW);
    const chatStart = frame.lines.findIndex((line) => line.includes("Tell me a joke"));
    expect(chatStart).toBeGreaterThanOrEqual(0);
    const jokeIdx = frame.lines.findIndex((line) => line.includes("Why did the chicken"));
    expect(jokeIdx).toBeGreaterThan(chatStart);
  });

  test("tool cards render inline (T2 worker path)", () => {
    let state = loadSingleAgent(INITIAL_TUI_STATE);
    state = reduce(state, Actions.receiveEvent(Events.userPrompt(USER_SENDER, "my-team", "Do work", "general-1")));
    state = reduce(state, Actions.receiveEvent(Events.agentToolCall(AGENT_SENDER, "c1", "read_file", "input.txt")));
    state = reduce(state, Actions.receiveEvent(Events.agentToolResult(AGENT_SENDER, "c1", "read_file", "file content", 12, null)));
    const frame = render(state, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((line) => line.includes("✓ read_file"))).toBe(true);
    expect(frame.lines.some((line) => line.includes("12ms"))).toBe(true);
  });
});

describe("render — working indicator (T1, T5)", () => {
  test("working indicator shows when focused agent is busy", () => {
    let state = loadSingleAgent(INITIAL_TUI_STATE);
    state = reduce(state, Actions.receiveEvent(Events.userPrompt(USER_SENDER, "my-team", "Tell me a story", "general-1")));
    state = reduce(state, Actions.receiveEvent(Events.agentTurnStart(AGENT_SENDER)));
    const frame = render(state, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((line) => line.includes("Working…"))).toBe(true);
  });
});

describe("render — footer", () => {
  test("footer line 1: cwd (branch) left, teamId:focusedAgentKey right", () => {
    const state = loadSingleAgent(INITIAL_TUI_STATE);
    const frame = render(state, { cols: 80, rows: 30, cwd: "/home/cuz/ws", branch: "main" }, NOW);
    const line1 = frame.lines[frame.lines.length - 2]!;
    expect(line1).toContain("/home/cuz/ws (main)");
    expect(line1).toContain("my-team:general-1");
  });

  test("footer line 2: hint + (provider) model | effort", () => {
    const state = loadSingleAgent(INITIAL_TUI_STATE);
    const frame = render(state, { cols: 80, rows: 30, provider: "anthropic", modelId: "opus-4.8", effort: "max" }, NOW);
    const line2 = frame.lines[frame.lines.length - 1]!;
    expect(line2).toContain("←← for agents");
    expect(line2).toContain("(anthropic) opus-4.8 | max");
  });
});

describe("railWidth formula", () => {
  test("cols < 80: 25% of cols, min 12 (visible by inspecting the rail width of the rendered frame)", () => {
    let state = INITIAL_TUI_STATE;
    state = reduce(state, Actions.toggleTeamRail());
    state = reduce(state, Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const frame = render(state, { cols: 60, rows: 30 }, NOW);
    const railRow = frame.lines.find((line) => line.includes("general"));
    expect(railRow).toBeDefined();
    const railWidth = railRow!.indexOf("│");
    expect(railWidth).toBeGreaterThanOrEqual(12);
  });
  test("cols >= 80: rail width bounded", () => {
    let state = INITIAL_TUI_STATE;
    state = reduce(state, Actions.toggleTeamRail());
    state = reduce(state, Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const frame = render(state, { cols: 100, rows: 30 }, NOW);
    const railRow = frame.lines.find((line) => line.includes("general"));
    expect(railRow).toBeDefined();
    const railWidth = railRow!.indexOf("│");
    expect(railWidth).toBeGreaterThanOrEqual(15);
    expect(railWidth).toBeLessThanOrEqual(24);
  });
});
