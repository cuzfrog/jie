import { type AgentMessage, type TeamInfo } from "@cuzfrog/jie-platform";
import type { Usage } from "@earendil-works/pi-ai";
import { teamLoadReducer } from "./team-load-reducer";
import { StateStoreImpl } from "./state-store";
import type { TuiState } from "./state";


const INITIAL_TUI_STATE: TuiState = new StateStoreImpl().getState();

function team(agents: ReadonlyArray<{
  role: string;
  agentKey: string;
  isLeader: boolean;
  model: { provider: string; id: string; effort: "off" | "low" | "medium" | "high" | "max"; contextWindow: number | null } | null;
}>): TeamInfo {
  const leader = agents.find((a) => a.isLeader) ?? agents[0];
  return {
    id: "my-team",
    leaderKey: leader?.agentKey ?? "general-1",
    history: [],
    agents: agents.map((a) => ({
      teamId: "my-team",
      role: a.role,
      agentKey: a.agentKey,
      isLeader: a.isLeader,
      model: a.model,
    })),
  };
}

describe("teamLoadReducer", () => {
  test("seeds agents and focuses the leader", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    expect(state.teamId).toBe("my-team");
    expect(state.agents.size).toBe(1);
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
  });

  test("seeds the model from the TeamInfo for new agents", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: null } },
    ]));
    expect(state.agents.get("my-team:general-1")?.model).toEqual({
      provider: "lm-studio",
      id: "ornith-1.0-9b-mtp",
      effort: "off",
      contextWindow: null,
    });
  });

  test("seeds the model with contextWindow from TeamInfo (populates from body.identity.model)", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: { provider: "openai", id: "gpt-4", effort: "off", contextWindow: 200000 } },
    ]));
    expect(state.agents.get("my-team:general-1")?.model?.contextWindow).toBe(200000);
  });

  test("preserves the existing model when the new payload carries model: null (no overwrite)", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: null } },
    ]));
    const second = teamLoadReducer(first, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    expect(second.agents.get("my-team:general-1")?.model).toEqual({
      provider: "lm-studio",
      id: "ornith-1.0-9b-mtp",
      effort: "off",
      contextWindow: null,
    });
  });

  test("team switch clears the agent map and leader focus from the prior team", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    const second = teamLoadReducer(first, {
      id: "my-team-2",
      leaderKey: "worker-1",
      history: [],
      agents: [
        { teamId: "my-team-2", role: "manager", agentKey: "manager-1", isLeader: false, model: null },
        { teamId: "my-team-2", role: "worker", agentKey: "worker-1", isLeader: true, model: null },
      ],
    });
    expect(second.teamId).toBe("my-team-2");
    expect(second.agents.size).toBe(2);
    expect(second.agents.has("my-team-2:worker-1")).toBe(true);
    expect(second.agents.has("my-team:general-1")).toBe(false);
    expect(second.leaderAgentId).toBe("my-team-2:worker-1");
    expect(second.focusedAgentId).toBe("my-team-2:worker-1");
  });

  test("same-team reload preserves agents that still exist", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
      { role: "helper", agentKey: "helper-1", isLeader: false, model: null },
    ]));
    const second = teamLoadReducer(first, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    expect(second.agents.size).toBe(1);
    expect(second.agents.has("my-team:general-1")).toBe(true);
    expect(second.agents.has("my-team:helper-1")).toBe(false);
  });

  test("team switch resets every agent's todos to []", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    const seededAgents = new Map(first.agents);
    const withTodosAgent = seededAgents.get("my-team:general-1");
    if (withTodosAgent === undefined) throw new Error("seed missing");
    seededAgents.set("my-team:general-1", { ...withTodosAgent, todos: [{ content: "carry-over", status: "in_progress" }] });
    const withTodos: TuiState = { ...first, agents: seededAgents };
    const switched = teamLoadReducer(withTodos, {
      id: "my-team-2",
      leaderKey: "worker-1",
      history: [],
      agents: [{ teamId: "my-team-2", role: "worker", agentKey: "worker-1", isLeader: true, model: null }],
    });
    expect(switched.agents.get("my-team-2:worker-1")?.todos).toEqual([]);
  });

  test("same-team reload preserves an agent's existing todos", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    const firstAgent = first.agents.get("my-team:general-1");
    if (firstAgent === undefined) throw new Error("seed missing");
    const seededAgents = new Map(first.agents);
    seededAgents.set("my-team:general-1", { ...firstAgent, todos: [{ content: "still here", status: "pending" }] });
    const withTodos: TuiState = { ...first, agents: seededAgents };
    const second = teamLoadReducer(withTodos, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    expect(second.agents.get("my-team:general-1")?.todos).toEqual([{ content: "still here", status: "pending" }]);
  });
});

function user(prompt: string): AgentMessage {
  return { role: "user", content: `[user]: ${prompt}`, timestamp: 0 };
}
function assistantText(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "stop", timestamp: 0,
  };
}
function assistantToolCall(id: string, name: string, args: Record<string, unknown>): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
    api: "openai", provider: "openai", model: "m", usage: usage(), stopReason: "toolUse", timestamp: 0,
  };
}
function toolResult(toolCallId: string, toolName: string, text: string, details?: unknown): AgentMessage {
  return { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError: false, details, timestamp: 0 };
}
function usage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("teamLoadReducer — resume hydration from TeamInfo.history", () => {
  test("non-empty messages hydrate the matching agent's currentTurn", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{ agentKey: "general-1", messages: [user("hello"), assistantText("world")] }],
    });
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history).toEqual([]);
    expect(agent?.currentTurn).toEqual({
      userPrompt: "hello",
      cards: [],
      blocks: [{ kind: "text", text: "world" }],
      streamId: null,
    });
  });

  test("earlier turns rotate into history and todos restore from the last todo result", () => {
    const todos = [{ content: "a", status: "completed" as const }];
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{
        agentKey: "general-1",
        messages: [
          user("first"), assistantText("a1"),
          user("second"), assistantToolCall("c1", "todo", {}), toolResult("c1", "todo", "ok", { kind: "todos", todos }),
        ],
      }],
    });
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history).toHaveLength(1);
    expect(agent?.history[0]?.userPrompt).toBe("first");
    expect(agent?.currentTurn?.userPrompt).toBe("second");
    expect(agent?.todos).toEqual(todos);
  });

  test("empty messages preserve an existing slot (switchTeam identity must not clobber live state)", () => {
    const seeded = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    const existing = seeded.agents.get("my-team:general-1");
    if (existing === undefined) throw new Error("seed missing");
    const streamingTurn = { userPrompt: "live", cards: [], blocks: [{ kind: "text" as const, text: "streaming…" }], streamId: 1 };
    const liveAgents = new Map(seeded.agents);
    liveAgents.set("my-team:general-1", { ...existing, currentTurn: streamingTurn });
    const withLive: TuiState = { ...seeded, agents: liveAgents };
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, model: null }]);
    const after = teamLoadReducer(withLive, { ...info, history: [{ agentKey: "general-1", messages: [] }] });
    expect(after.agents.get("my-team:general-1")?.currentTurn).toBe(streamingTurn);
  });

  test("history for an agentKey absent from the payload is skipped without creating a slot", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{ agentKey: "ghost-1", messages: [user("boo"), assistantText("gone")] }],
    });
    expect(state.agents.size).toBe(1);
    expect(state.agents.has("my-team:ghost-1")).toBe(false);
  });

  test("contextTokensUsed is estimated from the hydrated content", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{ agentKey: "general-1", messages: [user("count me"), assistantText("twelve chars")] }],
    });
    expect(state.agents.get("my-team:general-1")?.contextTokensUsed).toBeGreaterThan(0);
  });
});
