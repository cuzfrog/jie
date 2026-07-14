import { render } from "../../test-renderer";
import { TuiContext } from "../context";
import { makeContextValue } from "../../test-support";
import type { AgentUiState, TuiState } from "../../state";
import type { TodoItem } from "../../todo";
import { TodoList } from "./todo-list";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const FOCUSED_AGENT_ID = "team:agent-1" as AgentUiState["agentId"];

function makeAgent(todos: ReadonlyArray<TodoItem>): AgentUiState {
  return {
    agentId: FOCUSED_AGENT_ID,
    teamId: "team",
    agentKey: "agent-1",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
    lastStopReason: null,
    contextTokensUsed: 0,
    todos,
  };
}

function makeStateWithTodos(todos: ReadonlyArray<TodoItem>): TuiState {
  const base = makeContextValue();
  const nextAgents = new Map(base.state.agents);
  nextAgents.set(FOCUSED_AGENT_ID, makeAgent(todos));
  return { ...base.state, focusedAgentId: FOCUSED_AGENT_ID, agents: nextAgents };
}

describe("TodoList", () => {
  test("renders nothing when focused agent has no todos", () => {
    const ctx = makeContextValue({ state: makeStateWithTodos([]) });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={80} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("renders each todo content line", () => {
    const todos: TodoItem[] = [
      { content: "write tests", status: "completed" },
      { content: "wire reducer", status: "in_progress" },
      { content: "ship it", status: "pending" },
    ];
    const ctx = makeContextValue({ state: makeStateWithTodos(todos) });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={80} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("write tests");
    expect(frame).toContain("wire reducer");
    expect(frame).toContain("ship it");
    unmount();
  });

  test("renders the completed and in_progress markers", () => {
    const todos: TodoItem[] = [
      { content: "done thing", status: "completed" },
      { content: "active thing", status: "in_progress" },
      { content: "later thing", status: "pending" },
    ];
    const ctx = makeContextValue({ state: makeStateWithTodos(todos) });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={80} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("✓");
    expect(frame).toContain("▶");
    unmount();
  });

  test("renders nothing when there is no focused agent", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={80} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("caps rendering at MAX_VISIBLE_TODOS items even when the agent has more", () => {
    const todos: TodoItem[] = Array.from({ length: 9 }, (_, i) => ({ content: `item ${i}`, status: "pending" }));
    const ctx = makeContextValue({ state: makeStateWithTodos(todos) });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={80} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("item 0");
    expect(frame).toContain("item 5");
    expect(frame).not.toContain("item 6");
    unmount();
  });

  test("truncates content longer than the available width with an ellipsis", () => {
    const long = "x".repeat(120);
    const ctx = makeContextValue({ state: makeStateWithTodos([{ content: long, status: "pending" }]) });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <TodoList width={20} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain(long);
    expect(frame).toContain("…");
    unmount();
  });
});