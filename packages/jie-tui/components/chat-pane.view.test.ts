import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { ChatPane } from "./chat-pane";
import type { AgentUiState, MessageTurn } from "../state";

const AGENT_ID = "demo:general-1" as const;

function makeAgent(history: MessageTurn[], currentTurn: MessageTurn | null = null): AgentUiState {
  return {
    agentId: AGENT_ID,
    teamId: "demo",
    agentKey: "general-1",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history,
    currentTurn,
    lastStopReason: null,
  };
}

function renderText(pane: ChatPane, cols: number): string {
  return pane.render(cols).join("\n");
}

async function captureViewport(pane: ChatPane, cols: number, rows: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, rows);
  terminal.start(() => {}, () => {});
  const rendered = pane.render(cols);
  let row = 0;
  for (const line of rendered) {
    terminal.write(line.slice(0, cols));
    row++;
    if (row >= rows) break;
  }
  return terminal.flushAndGetViewport();
}

describe("ChatPane — view", () => {
  test("renders empty for a null agent", () => {
    const pane = new ChatPane();
    expect(pane.render(80)).toEqual([]);
  });

  test("user prompt appears before assistant text in the rendered order", () => {
    const pane = new ChatPane();
    const agent = makeAgent([{
      userPrompt: "fact please",
      cards: [],
      blocks: [{ kind: "text", text: "sky is blue" }],
      streamId: null,
    }]);
    pane.setAgent(agent);
    const flat = renderText(pane, 80);
    const promptAt = flat.indexOf("fact please");
    const replyAt = flat.indexOf("sky is blue");
    expect(promptAt).toBeGreaterThanOrEqual(0);
    expect(replyAt).toBeGreaterThanOrEqual(0);
    expect(promptAt).toBeLessThan(replyAt);
  });

  test("two turns render with both prompts and both replies", () => {
    const pane = new ChatPane();
    const agent = makeAgent([
      { userPrompt: "first", cards: [], blocks: [{ kind: "text", text: "one" }], streamId: null },
      { userPrompt: "second", cards: [], blocks: [{ kind: "text", text: "two" }], streamId: null },
    ]);
    pane.setAgent(agent);
    const flat = renderText(pane, 80);
    expect(flat).toContain("first");
    expect(flat).toContain("second");
    expect(flat).toContain("one");
    expect(flat).toContain("two");
    expect(flat.indexOf("first")).toBeLessThan(flat.indexOf("second"));
  });

  test("toolCall followed by toolResult appear in the same turn", () => {
    const pane = new ChatPane();
    const agent = makeAgent([{
      userPrompt: "read it",
      cards: [
        { kind: "toolCall", callId: "c1", name: "read_file", input: "a.txt" },
        { kind: "toolResult", callId: "c1", name: "read_file", output: "body", durationMs: 7, error: null },
      ],
      blocks: [],
      streamId: null,
    }]);
    pane.setAgent(agent);
    const flat = renderText(pane, 80);
    expect(flat).toContain("read_file");
    expect(flat).toContain("body");
  });

  test("currentTurn renders after the last history turn", () => {
    const pane = new ChatPane();
    const agent = makeAgent(
      [{ userPrompt: "past", cards: [], blocks: [{ kind: "text", text: "past-reply" }], streamId: null }],
      { userPrompt: "now", cards: [], blocks: [{ kind: "text", text: "now-reply" }], streamId: 1 },
    );
    pane.setAgent(agent);
    const flat = renderText(pane, 80);
    expect(flat.indexOf("past")).toBeGreaterThanOrEqual(0);
    expect(flat.indexOf("now")).toBeGreaterThanOrEqual(0);
    expect(flat.indexOf("past-reply")).toBeLessThan(flat.indexOf("now-reply"));
  });

  test("viewport renders without truncating the assistant text", async () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent([{
      userPrompt: "q",
      cards: [],
      blocks: [{ kind: "text", text: "answer-here" }],
      streamId: null,
    }]));
    const viewport = await captureViewport(pane, 60, 60);
    const visible = viewport.filter((line) => line.trim() !== "");
    expect(visible.length).toBeGreaterThanOrEqual(2);
    expect(visible.some((line) => line.includes("q"))).toBe(true);
    expect(visible.some((line) => line.includes("answer-here"))).toBe(true);
  });
});
