import { ChatPane, chatPaneFromAgent } from "./chat-pane";
import type { AgentUiState } from "../state";

const AGENT_ID = "default:general-1" as const;

function makeAgent(overrides: Partial<AgentUiState> = {}): AgentUiState {
  return {
    agentId: AGENT_ID,
    teamId: "default",
    agentKey: "general-1",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    history: [],
    currentTurn: null,
    lastStopReason: null,
    ...overrides,
  };
}

describe("ChatPane", () => {
  test.each([
    { name: "null agent", agent: null },
    { name: "agent with no turns", agent: makeAgent() },
  ])("renders empty for $name", ({ agent }) => {
    const pane = new ChatPane();
    pane.setAgent(agent);
    expect(pane.render(60)).toEqual([]);
  });

  test.each([
    {
      name: "the user prompt with a chevron prefix",
      history: [{ userPrompt: "Tell me a joke", cards: [], blocks: [], streamId: null }],
      expected: "› Tell me a joke",
    },
    {
      name: "message block text",
      history: [{
        userPrompt: "hi",
        cards: [],
        blocks: [{ kind: "text", text: "hello there" }],
        streamId: null,
      }],
      expected: "hello there",
    },
    {
      name: "tool call card with its name",
      history: [{
        userPrompt: "read it",
        cards: [{ kind: "toolCall", callId: "c1", name: "read_file", input: "a.txt" }],
        blocks: [],
        streamId: null,
      }],
      expected: "● read_file",
    },
  ])("renders $name", ({ history, expected }) => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({ history }));
    expect(pane.render(60).join("\n")).toContain(expected);
  });

  test("renders tool result card with success glyph", () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "read it",
        cards: [
          { kind: "toolCall", callId: "c1", name: "read_file", input: "a.txt" },
        ],
        blocks: [],
        streamId: null,
      }, {
        userPrompt: "",
        cards: [
          { kind: "toolResult", callId: "c2", name: "read_file", output: "abc", durationMs: 12, error: null },
        ],
        blocks: [],
        streamId: null,
      }],
    }));
    const flat = pane.render(60).join("\n");
    expect(flat).toContain("● read_file");
    expect(flat).toContain("✓ read_file");
  });

  test("renders currentTurn after history", () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "first",
        cards: [],
        blocks: [{ kind: "text", text: "first-reply" }],
        streamId: null,
      }],
      currentTurn: {
        userPrompt: "second",
        cards: [],
        blocks: [{ kind: "text", text: "second-reply" }],
        streamId: 1,
      },
    }));
    const flat = pane.render(60).join("\n");
    expect(flat).toContain("first");
    expect(flat).toContain("second");
    expect(flat.indexOf("first")).toBeLessThan(flat.indexOf("second"));
  });

  test("setAgent replaces prior content", () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "old",
        cards: [],
        blocks: [{ kind: "text", text: "old-reply" }],
        streamId: null,
      }],
    }));
    expect(pane.render(60).join("\n")).toContain("old-reply");
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "new",
        cards: [],
        blocks: [{ kind: "text", text: "new-reply" }],
        streamId: null,
      }],
    }));
    const flat = pane.render(60).join("\n");
    expect(flat).toContain("new-reply");
    expect(flat).not.toContain("old-reply");
  });

  test("re-render at the same width is a no-op on the child tree", () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "hi",
        cards: [],
        blocks: [{ kind: "text", text: "hello" }],
        streamId: null,
      }],
    }));
    const first = pane.children;
    pane.render(60);
    const second = pane.children;
    pane.render(60);
    const third = pane.children;
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test("invalidate forces a re-render on the next call", () => {
    const pane = new ChatPane();
    pane.setAgent(makeAgent({
      history: [{
        userPrompt: "hi",
        cards: [],
        blocks: [{ kind: "text", text: "hello" }],
        streamId: null,
      }],
    }));
    const first = pane.render(60);
    pane.invalidate();
    const second = pane.render(60);
    expect(second).toEqual(first);
  });
});

describe("chatPaneFromAgent", () => {
  test("constructs a pane already populated with the agent", () => {
    const pane = chatPaneFromAgent(makeAgent({
      history: [{
        userPrompt: "hi",
        cards: [],
        blocks: [],
        streamId: null,
      }],
    }));
    expect(pane.render(60).join("\n")).toContain("› hi");
  });
});
