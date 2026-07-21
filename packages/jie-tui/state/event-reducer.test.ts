import { Events, type AgentSender, type SystemSender, type UserSender } from "@cuzfrog/jie-platform";
import type { TuiState } from "./state";
import { createStateStore } from "./state-store";
import { reduce } from "./event-reducer";
import { reduce as reduceAction } from "./reducer";
import { Actions } from "./actions";

const INITIAL_TUI_STATE = createStateStore().getState();

const SYSTEM_SENDER: SystemSender = { kind: "system" };
const USER_SENDER: UserSender = { kind: "user" };
const AGENT_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "general-1" };
const STREAM_SENDER: AgentSender = AGENT_SENDER;
const TOOL_SENDER: AgentSender = AGENT_SENDER;

function loadedState(): TuiState {
  return reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey: "general-1",
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  }));
}

function promptedState(): TuiState {
  return reduce(loadedState(), Events.userPrompt(USER_SENDER, "my-team", "hi", "general-1"));
}

describe("reduceTeamLoaded", () => {
  test("seeds agents and focuses the leader", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team",
      leaderKey: "general-1",
      agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    expect(state.teamId).toBe("my-team");
    expect(state.agents.size).toBe(1);
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
  });

  test("team switch resets the agent map and clears leader focus from prior team", () => {
    const state1 = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team-1",
      leaderKey: "general-1",
      agents: [{ teamId: "my-team-1", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    const state2 = reduce(state1, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team-2",
      leaderKey: "general-1",
      agents: [{ teamId: "my-team-2", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    expect(state2.teamId).toBe("my-team-2");
    expect(state2.agents.size).toBe(1);
    expect(state2.agents.has("my-team-2:general-1")).toBe(true);
    expect(state2.agents.has("my-team-1:general-1")).toBe(false);
    expect(state2.leaderAgentId).toBe("my-team-2:general-1");
  });

  test("non-leader agent is recorded but leader flag stays false", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team",
      leaderKey: "manager-1",
      agents: [
        { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, model: null },
        { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, model: null },
      ],
    }));
    expect(state.leaderAgentId).toBe("my-team:manager-1");
    expect(state.agents.get("my-team:worker-1")?.isLeader).toBe(false);
  });
});

describe("Actions.switchTeam", () => {
  test("first-time switch from empty state seeds agents and focuses the leader", () => {
    const identity = {
      id: "my-team",
      leaderKey: "general-1",
      agents: [
        { teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null },
      ],
    };
    const state = reduceAction(INITIAL_TUI_STATE, Actions.switchTeam(identity));
    expect(state.teamId).toBe("my-team");
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
    expect(state.agents.size).toBe(1);
    expect(state.agents.get("my-team:general-1")?.isLeader).toBe(true);
  });

  test("subsequent switch to a different team resets agents and re-focuses the new leader", () => {
    const first = reduceAction(INITIAL_TUI_STATE, Actions.switchTeam({
      id: "team-a",
      leaderKey: "general-1",
      agents: [{ teamId: "team-a", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    const second = reduceAction(first, Actions.switchTeam({
      id: "team-b",
      leaderKey: "worker-1",
      agents: [
        { teamId: "team-b", role: "manager", agentKey: "manager-1", isLeader: false, model: null },
        { teamId: "team-b", role: "worker", agentKey: "worker-1", isLeader: true, model: null },
      ],
    }));
    expect(second.teamId).toBe("team-b");
    expect(second.leaderAgentId).toBe("team-b:worker-1");
    expect(second.focusedAgentId).toBe("team-b:worker-1");
    expect(second.agents.size).toBe(2);
    expect(second.agents.has("team-a:general-1")).toBe(false);
    expect(second.agents.get("team-b:worker-1")?.isLeader).toBe(true);
    expect(second.agents.get("team-b:manager-1")?.isLeader).toBe(false);
  });

  test("switchTeam carries the full identity a consumer needs (no platform round-trip in reducer)", () => {
    const identity = {
      id: "minimal",
      leaderKey: "general-1",
      agents: [{ teamId: "minimal", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    };
    const state = reduceAction(INITIAL_TUI_STATE, Actions.switchTeam(identity));
    expect(state.agents.get("minimal:general-1")?.role).toBe("general");
  });
});

describe("reduceUserPrompt", () => {
  test("starts a fresh turn when none is in flight", () => {
    const state = reduce(loadedState(), Events.userPrompt(USER_SENDER, "my-team", "hello", "general-1"));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.userPrompt).toBe("hello");
  });
});

describe("reduceModelAssigned", () => {
  test("populates focused agent's model", () => {
    const state = reduce(loadedState(), Events.agentModelAssigned(AGENT_SENDER, "openai", "gpt-4", "high"));
    expect(state.agents.get("my-team:general-1")?.model).toEqual({
      provider: "openai",
      id: "gpt-4",
      effort: "high",
      contextWindow: null,
    });
  });

  test("ignores events for a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentModelAssigned(foreign, "anthropic", "claude", "low"));
    expect(state2.agents.get("my-team:general-1")?.model).toBeNull();
  });

  test("ignores events before any team is loaded", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.agentModelAssigned(AGENT_SENDER, "openai", "gpt-4", "high"));
    expect(state).toBe(INITIAL_TUI_STATE);
  });
});

describe("reduceQueueUpdate", () => {
  test("replaces the agent's queue with the snapshot", () => {
    const state = reduce(loadedState(), Events.agentPromptQueueUpdate(AGENT_SENDER, ["alpha", "beta"]));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual(["alpha", "beta"]);
  });

  test("clears the queue when the body publishes an empty array", () => {
    let state = loadedState();
    state = reduce(state, Events.agentPromptQueueUpdate(AGENT_SENDER, ["queued"]));
    state = reduce(state, Events.agentPromptQueueUpdate(AGENT_SENDER, []));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events for a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentPromptQueueUpdate(foreign, ["x"]));
    expect(state2.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events for an unknown agent in the loaded team", () => {
    const stranger: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "ghost" };
    const state = reduce(loadedState(), Events.agentPromptQueueUpdate(stranger, ["x"]));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events before any team is loaded", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.agentPromptQueueUpdate(AGENT_SENDER, ["x"]));
    expect(state).toBe(INITIAL_TUI_STATE);
  });
});

describe("reduceTurnStart", () => {
  test("sets focused agent status to busy", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER));
    expect(state.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("clears the error banner when the next turn starts", () => {
    let state = loadedState();
    state = { ...state, errorBanner: "No model" };
    const state2 = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    expect(state2.errorBanner).toBeNull();
    expect(state2.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("opens an empty turn so stream chunks after a prompt-less turn.start are captured", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn).toEqual({ userPrompt: "", cards: [], blocks: [], streamId: null });
    const state2 = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "hello"));
    expect(state2.agents.get("my-team:general-1")?.currentTurn?.blocks).toEqual([{ kind: "text", text: "hello" }]);
  });

  test("records tool calls after a prompt-less turn.start", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER));
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    expect(card?.kind).toBe("toolCall");
    expect(card?.name).toBe("bash");
  });

  test("rejects events from a foreign team (cross-team guard)", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentTurnStart(foreign));
    expect(state2).toBe(state);
  });
});

describe("reduceIdle", () => {
  test("sets status idle and stamps lastStopReason", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.status).toBe("idle");
    expect(agent?.lastStopReason).toBe("stop");
  });

  test("keeps a populated currentTurn for the next turn to rotate (tui-state.md)", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "answer"));
    state = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.status).toBe("idle");
    expect(agent?.history.length).toBe(0);
    expect(agent?.currentTurn?.blocks).toEqual([{ kind: "text", text: "answer" }]);
  });

  test("rejects idle events from a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentIdle(foreign, "stop"));
    expect(state2).toBe(state);
  });
});

describe("reduceUsage", () => {
  test("agent.usage sets contextTokensUsed to totalTokens", () => {
    const state = loadedState();
    const state2 = reduce(state, Events.agentUsage(AGENT_SENDER, {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 1234,
    }));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBe(1234);
  });

  test("agent.usage overrides prior estimate-based contextTokensUsed", () => {
    let state = loadedState();
    state = reduce(state, Events.userPrompt(USER_SENDER, "my-team", "hello", "general-1"));
    const before = state.agents.get("my-team:general-1")?.contextTokensUsed ?? 0;
    const state2 = reduce(state, Events.agentUsage(AGENT_SENDER, {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 99999,
    }));
    const after = state2.agents.get("my-team:general-1")?.contextTokensUsed ?? 0;
    expect(after).toBe(99999);
    expect(after).not.toBe(before);
  });

  test("rejects usage events from a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentUsage(foreign, {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 1,
    }));
    expect(state2).toBe(state);
  });

  test("two consecutive agent.usage events last-wins on contextTokensUsed", () => {
    const state = loadedState();
    const mid = reduce(state, Events.agentUsage(AGENT_SENDER, {
      input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 100,
    }));
    const final = reduce(mid, Events.agentUsage(AGENT_SENDER, {
      input: 5, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 250,
    }));
    const agent = final.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBe(250);
    expect(agent?.lastReportedTotalTokens).toBe(250);
  });
});

describe("reduceIdle after agent.usage", () => {
  test("agent.idle preserves the precise contextTokensUsed set by a prior agent.usage", () => {
    let state = loadedState();
    state = reduce(state, Events.userPrompt(USER_SENDER, "my-team", "hi", "general-1"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    state = reduce(state, Events.agentUsage(AGENT_SENDER, {
      input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 480,
    }));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBe(480);
    expect(agent?.status).toBe("idle");
  });

  test("agent.idle falls back to the estimator when no agent.usage has fired yet", () => {
    let state = loadedState();
    state = reduce(state, Events.userPrompt(USER_SENDER, "my-team", "hi", "general-1"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBeGreaterThan(0);
    expect(agent?.status).toBe("idle");
  });
});

describe("reduceStreamChunk", () => {
  test("appends to the current block of the same type", () => {
    let state = promptedState();
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "Hello "));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "text", "world"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks).toEqual([
      { kind: "text", text: "Hello world" },
    ]);
  });

  test("opens a new block when block_type changes", () => {
    let state = promptedState();
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "Hello "));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "text", "world"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 3, "thinking", "I think"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[1]).toEqual({ kind: "thinking", text: "I think" });
  });

  test("opens a new block when stream_id changes", () => {
    let state = promptedState();
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "first "));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "text", "turn"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 2, 1, "text", "second"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[1]?.text).toBe("second");
  });

  test("rejects events from a foreign team", () => {
    const state = promptedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentStreamChunk(foreign, 1, 1, "text", "x"));
    expect(state2).toBe(state);
  });
});

describe("reduceToolCall + reduceToolResult", () => {
  test("a tool.call followed by a matching tool.result produces a single result card", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "out", 12, null));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.cards.length).toBe(1);
    const card = agent?.currentTurn?.cards[0];
    expect(card?.kind).toBe("toolResult");
    if (card?.kind === "toolResult") {
      expect(card.callId).toBe("c1");
      expect(card.name).toBe("bash");
      expect(card.output).toBe("out");
      expect(card.durationMs).toBe(12);
      expect(card.error).toBeNull();
    }
  });

  test("unwraps the platform result envelope so the card shows the tool content text", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    const envelope = JSON.stringify({ content: "exit_code: 0", details: { exitCode: 0 }, terminate: false });
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", envelope, 9, null));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.output).toBe("exit_code: 0");
    }
  });

  test("keeps output that is not a content envelope verbatim", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "not json at all", 9, null));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.output).toBe("not json at all");
    }
  });

  test("a tool.result with no matching tool.call is rejected (no phantom card)", () => {
    let state = promptedState();
    const before = state.agents.get("my-team:general-1")?.currentTurn?.cards.length ?? 0;
    const after = reduce(state, Events.agentToolResult(TOOL_SENDER, "c2", "bash", "out", 5, null));
    expect(after).toBe(state);
    expect(after.agents.get("my-team:general-1")?.currentTurn?.cards.length).toBe(before);
  });

  test("an error result carries the error message and nulls the output", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", null, 5, "boom"));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.output).toBeNull();
      expect(card.error).toBe("boom");
    }
  });

  test("a tool.result preserves the input carried by the prior tool.call card", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "read_file", "/tmp/missing.txt"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "read_file", null, 18, "ENOENT", null));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.input).toBe("/tmp/missing.txt");
      expect(card.inputTruncated).toBe(false);
      expect(card.output).toBeNull();
      expect(card.error).toBe("ENOENT");
    }
  });

  test("rejects events from a foreign team", () => {
    const state = promptedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentToolCall(foreign, "c1", "bash", "x"));
    expect(state2).toBe(state);
  });

  test("the result card carries the details payload from the event", () => {
    let state = promptedState();
    const details = { kind: "diff", diff: "@@ -1 +1 @@\n-a\n+A" };
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "edit", "{}"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "edit", "ok", 5, null, details));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.details).toBe(details);
    }
  });

  test("a missing details payload lands as null on the result card", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "out", 5, null));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.details).toBeNull();
    }
  });

  test("a todo_write tool result updates the agent's todos from details.kind === 'todos'", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "todo_write", "{}"));
    const todos = [
      { content: "alpha", status: "completed" },
      { content: "beta", status: "in_progress" },
      { content: "gamma", status: "pending" },
    ] as const;
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "todo_write", "ok", 5, null, { kind: "todos", todos }));
    expect(state.agents.get("my-team:general-1")?.todos).toEqual(todos);
  });

  test("an empty todo list clears the agent's todos", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "todo_write", "{}"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "todo_write", "ok", 5, null, { kind: "todos", todos: [] }));
    expect(state.agents.get("my-team:general-1")?.todos).toEqual([]);
  });

  test("a tool result with non-todo details does not touch the agent's todos", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "out", 5, null, { kind: "diff", diff: "@@ -1 +1 @@\n-a\n+A" }));
    expect(state.agents.get("my-team:general-1")?.todos).toEqual([]);
  });

  test("a todo_write tool result for a foreign team is ignored", () => {
    const state = promptedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentToolResult(foreign, "c1", "todo_write", "ok", 5, null, { kind: "todos", todos: [{ content: "x", status: "in_progress" }] }));
    expect(state2).toBe(state);
    expect(state2.agents.get("my-team:general-1")?.todos).toEqual([]);
  });
});

