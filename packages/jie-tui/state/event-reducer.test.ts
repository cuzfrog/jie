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

  test("rejects idle events from a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
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
});

