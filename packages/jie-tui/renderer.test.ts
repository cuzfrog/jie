import { Events } from "@cuzfrog/jie-platform/event";
import { type TuiState, initialState } from "./state";
import { reduce } from "./state";
import { render } from "./renderer";

function loadSingleAgent(state: TuiState, teamId = "my-team"): TuiState {
  return reduce(state, Events.teamLoaded({ kind: "cli" }, teamId, [
    { role: "general", agent_key: "general-1", is_leader: true },
  ]));
}

function loadManagerWorker(state: TuiState): TuiState {
  return reduce(state, Events.teamLoaded({ kind: "cli" }, "my-team", [
    { role: "manager", agent_key: "manager-1", is_leader: true },
    { role: "worker", agent_key: "worker-1", is_leader: false },
  ]));
}

const AGENT_SENDER = { kind: "agent" as const, identity: { teamId: "my-team", agentRole: "general", agentKey: "general-1" } };
const NOW = 1_700_000_000_000;

describe("render — bottom strip layout", () => {
  test("rail hidden by default; editor placeholder is shown; footer has 2 lines", () => {
    const s = loadSingleAgent(initialState());
    const frame = render(s, { cols: 80, rows: 30, cwd: "/tmp", branch: "main" }, NOW);
    expect(frame.lines.length).toBe(30);
    const editorLine = frame.lines.find((l) => l.startsWith("type a prompt..."));
    expect(editorLine).toBeDefined();
    expect(frame.lines.some((l) => l.includes("←← for agents"))).toBe(true);
    expect(frame.lines.some((l) => l.includes("my-team:general-1"))).toBe(true);
  });

  test("rail visible after ui.rail.toggle; rail/chat separator present", () => {
    let s = loadManagerWorker(initialState());
    s = reduce(s, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    const railRows = frame.lines.filter((l) => l.includes("★"));
    expect(railRows.length).toBeGreaterThan(0);
    expect(frame.lines.some((l) => l.includes("│"))).toBe(true);
  });

  test("error banner replaces editor placeholder when present", () => {
    let s = loadSingleAgent(initialState());
    s = reduce(s, { version: 1, topic: "ui.error", sender: { kind: "tui" }, timestamp: "t", payload: { text: "No model selected", shownAt: 1 } });
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((l) => l.includes("[!] No model selected"))).toBe(true);
  });
});

describe("render — chat pane order (T2 fixtures)", () => {
  test("user prompt → text blocks; tool cards between prompt and text", () => {
    let s = loadSingleAgent(initialState());
    s = reduce(s, Events.userPrompt({ kind: "tui" }, "my-team", "Tell me a joke", "general-1"));
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "Why did the chicken cross"));
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 2, "text", " the road?"));
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    const chatStart = frame.lines.findIndex((l) => l.includes("Tell me a joke"));
    expect(chatStart).toBeGreaterThanOrEqual(0);
    const jokeIdx = frame.lines.findIndex((l) => l.includes("Why did the chicken"));
    expect(jokeIdx).toBeGreaterThan(chatStart);
  });

  test("tool cards render inline (T2 worker path)", () => {
    let s = loadSingleAgent(initialState());
    s = reduce(s, Events.userPrompt({ kind: "tui" }, "my-team", "Do work", "general-1"));
    s = reduce(s, Events.agentToolCall(AGENT_SENDER, "c1", "read_file", "input.txt", false));
    s = reduce(s, Events.agentToolResult(AGENT_SENDER, "c1", "read_file", "file content", false, 12, null));
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((l) => l.includes("✓ read_file"))).toBe(true);
    expect(frame.lines.some((l) => l.includes("12ms"))).toBe(true);
  });
});

describe("render — working indicator (T1, T5)", () => {
  test("working indicator shows when focused agent is busy", () => {
    let s = loadSingleAgent(initialState());
    s = reduce(s, Events.userPrompt({ kind: "tui" }, "my-team", "Tell me a story", "general-1"));
    s = reduce(s, Events.agentTurnStart(AGENT_SENDER));
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((l) => l.includes("Working…"))).toBe(true);
  });

  test("queue indicator: 1 prompt queued + truncated preview", () => {
    let s = loadSingleAgent(initialState());
    const longPrompt = "Also write me a haiku about it in the same file. " + "x".repeat(150);
    s = reduce(s, Events.agentQueueUpdate(AGENT_SENDER, [longPrompt]));
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((l) => l.includes("1 prompt queued"))).toBe(true);
    expect(frame.lines.some((l) => l.includes("Also write me a haiku"))).toBe(true);
    expect(frame.lines.some((l) => l.length > 200)).toBe(false);
  });

  test("queue indicator disappears after queue is emptied (T5 step 4)", () => {
    let s = loadSingleAgent(initialState());
    s = reduce(s, Events.agentQueueUpdate(AGENT_SENDER, ["queued"]));
    s = reduce(s, Events.agentQueueUpdate(AGENT_SENDER, []));
    const frame = render(s, { cols: 80, rows: 30 }, NOW);
    expect(frame.lines.some((l) => l.includes("prompt queued"))).toBe(false);
  });
});

describe("render — footer", () => {
  test("footer line 1: cwd (branch) left, teamId:focusedAgentKey right", () => {
    const s = loadSingleAgent(initialState());
    const frame = render(s, { cols: 80, rows: 30, cwd: "/home/cuz/ws", branch: "main" }, NOW);
    const line1 = frame.lines[frame.lines.length - 2]!;
    expect(line1).toContain("/home/cuz/ws (main)");
    expect(line1).toContain("my-team:general-1");
  });

  test("footer line 2: hint + (provider) model | effort", () => {
    const s = loadSingleAgent(initialState());
    const frame = render(s, { cols: 80, rows: 30, provider: "anthropic", modelId: "opus-4.8", effort: "max" }, NOW);
    const line2 = frame.lines[frame.lines.length - 1]!;
    expect(line2).toContain("←← for agents");
    expect(line2).toContain("(anthropic) opus-4.8 | max");
  });
});

describe("railWidth formula", () => {
  test("cols < 80: 25% of cols, min 12 (visible by inspecting the rail width of the rendered frame)", () => {
    let s = initialState();
    s = reduce(s, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    s = reduce(s, Events.teamLoaded({ kind: "cli" }, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]));
    const frame = render(s, { cols: 60, rows: 30 }, NOW);
    const railRow = frame.lines.find((l) => l.includes("general"));
    expect(railRow).toBeDefined();
    const railWidth = railRow!.indexOf("│");
    expect(railWidth).toBeGreaterThanOrEqual(12);
  });
  test("cols >= 80: rail width bounded", () => {
    let s = initialState();
    s = reduce(s, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    s = reduce(s, Events.teamLoaded({ kind: "cli" }, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]));
    const frame = render(s, { cols: 100, rows: 30 }, NOW);
    const railRow = frame.lines.find((l) => l.includes("general"));
    expect(railRow).toBeDefined();
    const railWidth = railRow!.indexOf("│");
    expect(railWidth).toBeGreaterThanOrEqual(15);
    expect(railWidth).toBeLessThanOrEqual(24);
  });
});