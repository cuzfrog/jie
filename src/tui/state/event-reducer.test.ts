import { Events, type AgentSender, type SystemSender, type ToolResultDetails, type UserSender } from "../../platform";
import type { TuiState } from "./state";
import { StateStoreImpl } from "./state-store";
import { reduce } from "./event-reducer";
import { reduce as reduceAction } from "./reducer";
import { Actions } from "./actions";

const INITIAL_TUI_STATE = new StateStoreImpl().getState();

const DIFF_DETAILS: ToolResultDetails = { kind: "diff", path: "a.txt", replacementsCount: 1, beforeBytes: 2, afterBytes: 2, diff: "@@ -1 +1 @@\n-a\n+A" };

const SYSTEM_SENDER: SystemSender = { kind: "system" };
const USER_SENDER: UserSender = { kind: "user" };
const AGENT_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "general-1" };
const STREAM_SENDER: AgentSender = AGENT_SENDER;
const TOOL_SENDER: AgentSender = AGENT_SENDER;
const MANAGER_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "manager-1" };
const WORKER_SENDER: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "worker-1" };

function loadedState(): TuiState {
  return reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey: "general-1",
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
    history: [],
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
  }));
}

function twoAgentState(): TuiState {
  return reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey: "manager-1",
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
    history: [],
    agents: [
      { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
      { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
    ],
  }));
}

function promptedState(): TuiState {
  return reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
}

function interruptedState(): TuiState {
  let state = loadedState();
  state = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
  return reduce(state, Events.agentIdle(AGENT_SENDER, "aborted"));
}

describe("reduceTeamLoaded", () => {
  test("seeds agents and focuses the leader", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team-1", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    }));
    const state2 = reduce(state1, Events.teamLoaded(SYSTEM_SENDER, {
      id: "my-team-2",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team-2", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [
        { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
        { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [
        { teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "team-a", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    }));
    const second = reduceAction(first, Actions.switchTeam({
      id: "team-b",
      leaderKey: "worker-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [
        { teamId: "team-b", role: "manager", agentKey: "manager-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
        { teamId: "team-b", role: "worker", agentKey: "worker-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
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
      id: "default-solo",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "default-solo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    };
    const state = reduceAction(INITIAL_TUI_STATE, Actions.switchTeam(identity));
    expect(state.agents.get("default-solo:general-1")?.role).toBe("general");
  });
});

describe("user.prompt", () => {
  test("is not reduced — turns are created by agent.turn.start", () => {
    const loaded = loadedState();
    const state = reduce(loaded, Events.userPrompt(USER_SENDER, "my-team", "general-1", "hello"));
    expect(state).toBe(loaded);
  });
});

describe("reduceModelAssigned", () => {
  test("populates focused agent's model with the payload context window", () => {
    const state = reduce(loadedState(), Events.agentModelAssigned(AGENT_SENDER, "openai", "gpt-4", "high", 128000));
    expect(state.agents.get("my-team:general-1")?.model).toEqual({
      provider: "openai",
      id: "gpt-4",
      effort: "high",
      contextWindow: 128000,
    });
  });

  test("follows a hot swap with the new model's context window", () => {
    const assigned = reduce(loadedState(), Events.agentModelAssigned(AGENT_SENDER, "openai", "gpt-4", "high", 128000));
    const swapped = reduce(assigned, Events.agentModelAssigned(AGENT_SENDER, "lm-studio", "qwen3.5-2b", "high", 32000));
    expect(swapped.agents.get("my-team:general-1")?.model).toEqual({
      provider: "lm-studio",
      id: "qwen3.5-2b",
      effort: "high",
      contextWindow: 32000,
    });
  });

  test("ignores events for a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentModelAssigned(foreign, "anthropic", "claude", "low", null));
    expect(state2.agents.get("my-team:general-1")?.model).toBeNull();
  });

  test("ignores events before any team is loaded", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.agentModelAssigned(AGENT_SENDER, "openai", "gpt-4", "high", 128000));
    expect(state).toBe(INITIAL_TUI_STATE);
  });
});

describe("reduceQueueUpdate", () => {
  test("replaces the agent's queue with the snapshot", () => {
    const state = reduce(loadedState(), Events.agentPromptQueueUpdate(AGENT_SENDER, [
      { text: "alpha", source: "user" },
      { text: "beta", source: "user" },
    ]));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([
      { text: "alpha", source: "user" },
      { text: "beta", source: "user" },
    ]);
  });

  test("preserves the source tag on each entry", () => {
    const state = reduce(loadedState(), Events.agentPromptQueueUpdate(AGENT_SENDER, [
      { text: "hello", source: "user" },
      { text: "[qa-1 on 'task.recorded']: report", source: "peer" },
    ]));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([
      { text: "hello", source: "user" },
      { text: "[qa-1 on 'task.recorded']: report", source: "peer" },
    ]);
  });

  test("clears the queue when the body publishes an empty array", () => {
    let state = loadedState();
    state = reduce(state, Events.agentPromptQueueUpdate(AGENT_SENDER, [{ text: "queued", source: "user" }]));
    state = reduce(state, Events.agentPromptQueueUpdate(AGENT_SENDER, []));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events for a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentPromptQueueUpdate(foreign, [{ text: "x", source: "user" }]));
    expect(state2.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events for an unknown agent in the loaded team", () => {
    const stranger: AgentSender = { kind: "agent", teamId: "my-team", agentKey: "ghost" };
    const state = reduce(loadedState(), Events.agentPromptQueueUpdate(stranger, [{ text: "x", source: "user" }]));
    expect(state.agents.get("my-team:general-1")?.queue).toEqual([]);
  });

  test("ignores events before any team is loaded", () => {
    const state = reduce(INITIAL_TUI_STATE, Events.agentPromptQueueUpdate(AGENT_SENDER, [{ text: "x", source: "user" }]));
    expect(state).toBe(INITIAL_TUI_STATE);
  });
});

describe("reduceTurnStart", () => {
  test("sets focused agent status to busy", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, null));
    expect(state.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("clears the error banner when the next turn starts", () => {
    let state = loadedState();
    state = { ...state, errorBanner: "No model" };
    const state2 = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
    expect(state2.errorBanner).toBeNull();
    expect(state2.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("opens an empty turn so stream chunks after a prompt-less turn.start are captured", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, null));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn).toEqual({ userPrompt: "", cards: [], blocks: [], streamId: null, seq: 0 });
    const state2 = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "hello"));
    expect(state2.agents.get("my-team:general-1")?.currentTurn?.blocks).toEqual([{ kind: "text", text: "hello" }]);
  });

  test("creates the turn with the event's prompt", () => {
    const state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hello"));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.userPrompt).toBe("hello");
    expect(state.agents.get("my-team:general-1")?.currentTurn?.seq).toBe(0);
    expect(state.nextEntrySeq).toBe(1);
  });

  test("a prompt-bearing turn.start on a populated turn rotates it", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "first"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "answer"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "second"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history[0]?.userPrompt).toBe("first");
    expect(agent?.currentTurn?.userPrompt).toBe("second");
    expect(agent?.currentTurn?.seq).toBe(1);
    expect(state.nextEntrySeq).toBe(2);
  });

  test("a prompt-bearing turn.start on an unpopulated prompted turn rotates it (no clobber)", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "first"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "second"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history[0]?.userPrompt).toBe("first");
    expect(agent?.currentTurn?.userPrompt).toBe("second");
  });

  test("turn.start adopts an unpopulated empty-prompt turn without consuming seq", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, null));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "queued"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.userPrompt).toBe("queued");
    expect(agent?.currentTurn?.seq).toBe(0);
    expect(state.nextEntrySeq).toBe(1);
  });

  test("three prompts fired in a row each keep their own turn (no prompt lost)", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "P1"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "text", "resp1"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "P2"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 2, 0, "text", "resp2"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "P3"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 3, 0, "text", "resp3"));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history.map((turn) => turn.userPrompt)).toEqual(["P1", "P2"]);
    expect(agent?.currentTurn?.userPrompt).toBe("P3");
    expect(agent?.history[0]?.blocks).toEqual([{ kind: "text", text: "resp1" }]);
    expect(agent?.history[1]?.blocks).toEqual([{ kind: "text", text: "resp2" }]);
    expect(agent?.currentTurn?.blocks).toEqual([{ kind: "text", text: "resp3" }]);
  });

  test("rotating a populated turn on the next turn.start assigns the following seq", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, null));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "answer"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history[0]?.seq).toBe(0);
    expect(agent?.currentTurn?.seq).toBe(1);
    expect(state.nextEntrySeq).toBe(2);
  });

  test("a turn.continue keeps the current turn and the next stream stamps its own thinking", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "do work"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "ponder"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 1, [300]));
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "out", 10, null));
    state = reduce(state, Events.agentTurnContinue(AGENT_SENDER));
    let agent = state.agents.get("my-team:general-1");
    expect(agent?.history.length).toBe(0);
    expect(agent?.currentTurn?.userPrompt).toBe("do work");
    expect(agent?.currentTurn?.seq).toBe(0);
    expect(state.nextEntrySeq).toBe(1);
    expect(agent?.currentTurn?.blocks).toEqual([{ kind: "thinking", text: "ponder", durationMs: 300 }]);
    expect(agent?.currentTurn?.cards.length).toBe(1);
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 2, 0, "thinking", "more"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 2, 1, [500]));
    agent = state.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[0]?.durationMs).toBe(300);
    expect(agent?.currentTurn?.blocks[1]?.durationMs).toBe(500);
  });

  test("a turn.continue clears the error banner and the interrupted marker", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "do work"));
    state = { ...state, errorBanner: "boom", interruptedAgentId: "my-team:general-1" };
    state = reduce(state, Events.agentTurnContinue(AGENT_SENDER));
    const agent = state.agents.get("my-team:general-1");
    expect(state.errorBanner).toBeNull();
    expect(state.interruptedAgentId).toBeNull();
    expect(agent?.status).toBe("busy");
    expect(agent?.currentTurn?.userPrompt).toBe("do work");
  });

  test("records tool calls after a prompt-less turn.start", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, null));
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "bash", "ls"));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    expect(card?.kind).toBe("toolCall");
    expect(card?.name).toBe("bash");
  });

  test("rejects events from a foreign team (cross-team guard)", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentTurnStart(foreign, null));
    expect(state2).toBe(state);
  });

  test("clears interruptedAgentId when the interrupted agent starts its next turn", () => {
    const state = reduce(interruptedState(), Events.agentTurnStart(AGENT_SENDER, null));
    expect(state.interruptedAgentId).toBeNull();
  });

  test("keeps interruptedAgentId when a different agent starts a turn", () => {
    let state = twoAgentState();
    state = reduce(state, Events.agentTurnStart(MANAGER_SENDER, null));
    state = reduce(state, Events.agentIdle(MANAGER_SENDER, "aborted"));
    expect(state.interruptedAgentId).toBe("my-team:manager-1");
    state = reduce(state, Events.agentTurnStart(WORKER_SENDER, null));
    expect(state.interruptedAgentId).toBe("my-team:manager-1");
  });
});

describe("reduceIdle", () => {
  test("sets status idle and stamps lastStopReason", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.status).toBe("idle");
    expect(agent?.lastStopReason).toBe("stop");
  });

  test("keeps a populated currentTurn for the next turn to rotate (tui-state.md)", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
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

  test("marks interruptedAgentId when the focused agent idles aborted", () => {
    const state = interruptedState();
    expect(state.interruptedAgentId).toBe("my-team:general-1");
  });

  test("leaves interruptedAgentId null when the focused agent idles with a normal stop", () => {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, null));
    state = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    expect(state.interruptedAgentId).toBeNull();
  });

  test("leaves interruptedAgentId null when a non-focused agent idles aborted", () => {
    let state = twoAgentState();
    state = reduce(state, Events.agentTurnStart(WORKER_SENDER, null));
    state = reduce(state, Events.agentIdle(WORKER_SENDER, "aborted"));
    expect(state.interruptedAgentId).toBeNull();
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
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "hello"));
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
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "hi"));
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
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "hi"));
    const state2 = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const agent = state2.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBeGreaterThan(0);
    expect(agent?.status).toBe("idle");
  });
});

describe("reduceCompacted", () => {
  function threeTurnState(): TuiState {
    let state = loadedState();
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "one"));
    state = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "two"));
    state = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "three"));
    return reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
  }

  test("drops the summarized turns, keeps the tail renumbered after the marker", () => {
    let state = threeTurnState();
    state = reduce(state, Events.agentUsage(AGENT_SENDER, {
      input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 99999,
    }));
    const compacted = reduce(state, Events.agentCompacted(AGENT_SENDER, "the summary", 500, 2));
    const agent = compacted.agents.get("my-team:general-1");
    expect(agent?.compactionMarker).toEqual({ seq: 3, summary: "the summary", tokensBefore: 500 });
    expect(agent?.history).toEqual([]);
    expect(agent?.currentTurn?.userPrompt).toBe("three");
    expect(agent?.currentTurn?.seq).toBe(4);
    expect(compacted.nextEntrySeq).toBe(5);
    expect(agent?.lastReportedTotalTokens).toBeNull();
    expect(agent?.contextTokensUsed).not.toBe(99999);
  });

  test("keeps at least one turn when summarized_prompts exceeds the known turns", () => {
    const compacted = reduce(threeTurnState(), Events.agentCompacted(AGENT_SENDER, "s", 1, 10));
    const agent = compacted.agents.get("my-team:general-1");
    expect(agent?.history).toEqual([]);
    expect(agent?.currentTurn?.userPrompt).toBe("three");
  });

  test("without any turns only the marker is recorded", () => {
    const compacted = reduce(loadedState(), Events.agentCompacted(AGENT_SENDER, "s", 1, 0));
    const agent = compacted.agents.get("my-team:general-1");
    expect(agent?.compactionMarker).toEqual({ seq: 0, summary: "s", tokensBefore: 1 });
    expect(agent?.history).toEqual([]);
    expect(agent?.currentTurn).toBeNull();
    expect(compacted.nextEntrySeq).toBe(1);
  });

  test("rejects compaction events from a foreign team", () => {
    const state = loadedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    expect(reduce(state, Events.agentCompacted(foreign, "s", 1, 0))).toBe(state);
  });

  test("sets compactionInProgress true on agent.compaction.start and false on agent.compaction.end", () => {
    const state = loadedState();
    let next = reduce(state, Events.agentCompactionStart(AGENT_SENDER));
    expect(next.agents.get("my-team:general-1")?.compactionInProgress).toBe(true);
    next = reduce(next, Events.agentCompactionEnd(AGENT_SENDER));
    expect(next.agents.get("my-team:general-1")?.compactionInProgress).toBe(false);
  });

  test("agent.compacted also clears compactionInProgress", () => {
    let state = loadedState();
    state = reduce(state, Events.agentCompactionStart(AGENT_SENDER));
    state = reduce(state, Events.agentCompacted(AGENT_SENDER, "s", 1, 0));
    expect(state.agents.get("my-team:general-1")?.compactionInProgress).toBe(false);
  });

  test("a later compaction replaces the marker and keeps the entry counter monotonic", () => {
    let state = reduce(threeTurnState(), Events.agentCompacted(AGENT_SENDER, "first summary", 500, 1));
    state = reduce(state, Events.agentTurnStart(AGENT_SENDER, "four"));
    state = reduce(state, Events.agentIdle(AGENT_SENDER, "stop"));
    const compacted = reduce(state, Events.agentCompacted(AGENT_SENDER, "second summary", 700, 2));
    const agent = compacted.agents.get("my-team:general-1");
    expect(agent?.compactionMarker).toEqual({ seq: 7, summary: "second summary", tokensBefore: 700 });
    expect(agent?.history).toEqual([]);
    expect(agent?.currentTurn?.userPrompt).toBe("four");
    expect(agent?.currentTurn?.seq).toBe(8);
    expect(compacted.nextEntrySeq).toBe(9);
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

describe("reduceStreamEnd", () => {
  test("stamps durationMs onto the turn's thinking blocks", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "ponder"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "answer"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 2, [350]));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.blocks).toEqual([
      { kind: "thinking", text: "ponder", durationMs: 350 },
      { kind: "text", text: "answer" },
    ]);
  });

  test("stamps each thinking block with its own segment duration, in order", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "a"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "mid"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "thinking", "b"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 3, [100, 250]));
    const blocks = state.agents.get("my-team:general-1")?.currentTurn?.blocks;
    expect(blocks?.[0]).toEqual({ kind: "thinking", text: "a", durationMs: 100 });
    expect(blocks?.[2]).toEqual({ kind: "thinking", text: "b", durationMs: 250 });
  });

  test("extra durations beyond the thinking blocks are ignored", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "a"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 1, [100, 250]));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.blocks).toEqual([
      { kind: "thinking", text: "a", durationMs: 100 },
    ]);
  });

  test("fewer durations than thinking blocks leave the remaining blocks unstamped", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "a"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 1, "text", "mid"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 2, "thinking", "b"));
    state = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 3, [100]));
    expect(state.agents.get("my-team:general-1")?.currentTurn?.blocks).toEqual([
      { kind: "thinking", text: "a", durationMs: 100 },
      { kind: "text", text: "mid" },
      { kind: "thinking", text: "b" },
    ]);
  });

  test("empty durations leave the state untouched", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "text", "answer"));
    const state2 = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 1, 1, []));
    expect(state2).toBe(state);
  });

  test("ignores a stream id that does not match the current turn", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "ponder"));
    const state2 = reduce(state, Events.agentStreamEnd(STREAM_SENDER, 2, 1, [100]));
    expect(state2).toBe(state);
  });

  test("rejects events from a foreign team", () => {
    let state = reduce(loadedState(), Events.agentTurnStart(AGENT_SENDER, "hi"));
    state = reduce(state, Events.agentStreamChunk(STREAM_SENDER, 1, 0, "thinking", "ponder"));
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentStreamEnd(foreign, 1, 1, [100]));
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
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "edit", "{}"));
    state = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "edit", "ok", 5, null, DIFF_DETAILS));
    const card = state.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    if (card?.kind === "toolResult") {
      expect(card.details).toBe(DIFF_DETAILS);
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

  test("a kanban_write tool result updates the board and completes its tool card", () => {
    let state = promptedState();
    state = reduce(state, Events.agentToolCall(TOOL_SENDER, "c1", "kanban_write", "{}"));
    const cards = [
      { id: "#1", content: "alpha", status: "completed" },
      { id: "#2", content: "beta", status: "in_progress" },
      { id: "#3", content: "gamma", status: "pending" },
    ] as const;
    const state2 = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "kanban_write", "Updated kanban: 3 cards, 1 in progress", 5, null, { kind: "kanban", cards }));
    expect(state2.kanbanBoard).toEqual(cards);
    expect(state2.kanbanCursor).toBe("#1");
    const card = state2.agents.get("my-team:general-1")?.currentTurn?.cards[0];
    expect(card?.kind).toBe("toolResult");
    if (card?.kind === "toolResult") {
      expect(card.output).toBe("Updated kanban: 3 cards, 1 in progress");
      expect(card.durationMs).toBe(5);
      expect(card.details).toEqual({ kind: "kanban", cards });
    }
  });

  test("a kanban_write tool result without a matching tool call still updates the board", () => {
    const state = promptedState();
    const cards = [
      { id: "#1", content: "alpha", status: "completed" },
      { id: "#2", content: "beta", status: "in_progress" },
    ] as const;
    const state2 = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "kanban_write", "ok", 5, null, { kind: "kanban", cards }));
    expect(state2.kanbanBoard).toEqual(cards);
    expect(state2.agents.get("my-team:general-1")?.currentTurn?.cards).toEqual([]);
  });

  test("an empty kanban board clears the board", () => {
    const state = promptedState();
    const state2 = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "kanban_write", "ok", 5, null, { kind: "kanban", cards: [] }));
    expect(state2.kanbanBoard).toEqual([]);
    expect(state2.kanbanCursor).toBeNull();
  });

  test("a tool result with non-kanban details does not touch the board", () => {
    const state = promptedState();
    const state2 = reduce(state, Events.agentToolResult(TOOL_SENDER, "c1", "bash", "out", 5, null, DIFF_DETAILS));
    expect(state2.kanbanBoard).toEqual([]);
  });

  test("a kanban_write tool result for a foreign team is ignored", () => {
    const state = promptedState();
    const foreign: AgentSender = { kind: "agent", teamId: "other-team", agentKey: "general-1" };
    const state2 = reduce(state, Events.agentToolResult(foreign, "c1", "kanban_write", "ok", 5, null, { kind: "kanban", cards: [{ id: "#1", content: "x", status: "in_progress" }] }));
    expect(state2).toBe(state);
    expect(state2.kanbanBoard).toEqual([]);
  });
});

