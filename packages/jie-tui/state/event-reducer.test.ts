import { Events, type AgentSender, type SystemSender, type UserSender } from "@cuzfrog/jie-platform/event";
import { INITIAL_TUI_STATE, type TuiState } from "./state";
import { reduce } from "./event-reducer";

const SYSTEM_SENDER: SystemSender = { kind: "system" };
const USER_SENDER: UserSender = { kind: "user" };
const AGENT_SENDER: AgentSender = { kind: "agent", identity: { teamId: "my-team", agentRole: "general", agentKey: "general-1" } };
const STREAM_SENDER: AgentSender = AGENT_SENDER;
const TOOL_SENDER: AgentSender = AGENT_SENDER;

function loadedState(): TuiState {
  return reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, "my-team", [
    { role: "general", agent_key: "general-1", is_leader: true },
  ]));
}

function promptedState(): TuiState {
  return reduce(loadedState(), Events.userPrompt(USER_SENDER, "my-team", "hi", "general-1"));
}

describe("reduceTeamLoaded", () => {
  test("seeds agents and focuses the leader", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]));
    expect(state.teamId).toBe("my-team");
    expect(state.agents.size).toBe(1);
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
  });

  test("team switch resets the agent map and clears leader focus from prior team", () => {
    const state1 = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, "my-team-1", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]));
    const state2 = reduce(state1, Events.teamLoaded(SYSTEM_SENDER, "my-team-2", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]));
    expect(state2.teamId).toBe("my-team-2");
    expect(state2.agents.size).toBe(1);
    expect(state2.agents.has("my-team-2:general-1")).toBe(true);
    expect(state2.agents.has("my-team-1:general-1")).toBe(false);
    expect(state2.leaderAgentId).toBe("my-team-2:general-1");
  });

  test("non-leader agent is recorded but leader flag stays false", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, "my-team", [
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]));
    expect(state.leaderAgentId).toBe("my-team:manager-1");
    expect(state.agents.get("my-team:worker-1")?.isLeader).toBe(false);
  });
});

describe("reduceUserPrompt", () => {
  test("starts a fresh turn when none is in flight", () => {
    const state = reduce(loadedState(), Events.userPrompt(USER_SENDER, "my-team", "hello", "general-1"));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.userPrompt).toBe("hello");
  });
});

describe("reduceTurnStart", () => {
  test("sets focused agent status to busy", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER));
    expect(state.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("clears the error banner (T4 path)", () => {
    let state = loadedState();
    state = { ...state, errorBanner: { text: "No model", raisedAt: 1 } };
    const state2 = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    expect(state2.errorBanner).toBeNull();
    expect(state2.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("rejects events from a foreign team (cross-team guard)", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", identity: { teamId: "other-team", agentRole: "general", agentKey: "general-1" } };
    const state2 = reduce(state, Events.agentTurnStart(foreign));
    expect(state2).toBe(state);
  });
});

describe("reduceIdle", () => {
  test("sets status idle and stamps lastIdleAt with a positive timestamp", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.status).toBe("idle");
    expect(typeof agent?.lastIdleAt).toBe("number");
    expect(agent?.lastIdleAt).toBeGreaterThan(0);
  });

  test("rejects idle events from a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", identity: { teamId: "other-team", agentRole: "general", agentKey: "general-1" } };
    const state2 = reduce(state, Events.agentIdle(foreign, "stop"));
    expect(state2).toBe(state);
  });
});

describe("reduceStreamChunk", () => {
  test("appends to the current block of the same type", () => {
    let state = promptedState();
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "Hello "));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "text", "world"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks).toEqual([
      { kind: "text", text: "Hello world", expanded: false },
    ]);
  });

  test("opens a new block when block_type changes", () => {
    let state = promptedState();
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "Hello "));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "text", "world"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 3, "thinking", "I think"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[1]).toEqual({ kind: "thinking", text: "I think", expanded: false });
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
    const foreign: AgentSender = { kind: "agent", identity: { teamId: "other-team", agentRole: "general", agentKey: "general-1" } };
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

  test("rejects events from a foreign team", () => {
    const state = promptedState();
    const foreign: AgentSender = { kind: "agent", identity: { teamId: "other-team", agentRole: "general", agentKey: "general-1" } };
    const state2 = reduce(state, Events.agentToolCall(foreign, "c1", "bash", "x"));
    expect(state2).toBe(state);
  });
});
