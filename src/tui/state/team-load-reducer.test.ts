import { type AgentMessage, type SkillInfo, type TeamInfo } from "../../platform";
import type { Usage } from "@earendil-works/pi-ai";
import { teamLoadReducer } from "./team-load-reducer";
import { StateStoreImpl } from "./state-store";
import type { TuiState } from "./state";


const INITIAL_TUI_STATE: TuiState = new StateStoreImpl().getState();

function team(agents: ReadonlyArray<{
  role: string;
  agentKey: string;
  isLeader: boolean;
  tools?: ReadonlyArray<string>;
  subscribe?: ReadonlyArray<string>;
  skills?: ReadonlyArray<SkillInfo>;
  model: { provider: string; id: string; effort: "off" | "low" | "medium" | "high" | "max"; contextWindow: number | null } | null;
}>, sessionName: string | null = null): TeamInfo {
  const leader = agents.find((a) => a.isLeader) ?? agents[0];
  return {
    id: "my-team",
    leaderKey: leader?.agentKey ?? "general-1",
    sessionName,
    currentSessionId: null,
    kanbanCards: [],
    history: [],
    agents: agents.map((a) => ({
      teamId: "my-team",
      role: a.role,
      agentKey: a.agentKey,
      isLeader: a.isLeader,
      tools: a.tools ?? [],
      subscribe: a.subscribe ?? [],
      skills: a.skills ?? [],
      model: a.model,
    })),
  };
}

describe("teamLoadReducer", () => {
  test("seeds agents and focuses the leader", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    expect(state.teamId).toBe("my-team");
    expect(state.agents.size).toBe(1);
    expect(state.leaderAgentId).toBe("my-team:general-1");
    expect(state.focusedAgentId).toBe("my-team:general-1");
  });

  test("carries the session name from the TeamInfo", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ], "my session"));
    expect(state.sessionName).toBe("my session");
  });

  test("switching teams replaces the previous session name", () => {
    const named = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ], "old name"));
    const switched = teamLoadReducer(named, {
      ...team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]),
      id: "other-team",
    });
    expect(switched.sessionName).toBeNull();
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

  test("seeds the resolved skill metadata from TeamInfo", () => {
    const skills = [
      { name: "say-hello", description: "greets", argumentHint: null },
      { name: "deploy", description: "deploys", argumentHint: "<env>" },
    ];
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, skills, model: null },
    ]));
    expect(state.agents.get("my-team:general-1")?.skills).toEqual(skills);
  });

  test("refreshes skills when a team is reloaded with a changed manifest", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      {
        role: "general", agentKey: "general-1", isLeader: true,
        skills: [{ name: "say-hello", description: "greets", argumentHint: null }], model: null,
      },
    ]));
    const second = teamLoadReducer(first, team([
      { role: "general", agentKey: "general-1", isLeader: true, skills: [], model: null },
    ]));
    expect(second.agents.get("my-team:general-1")?.skills).toEqual([]);
  });

  test("preserves the existing model when the new payload carries model: null (no overwrite)", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: null } },
    ]));
    const second = teamLoadReducer(first, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
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
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const second = teamLoadReducer(first, {
      id: "my-team-2",
      leaderKey: "worker-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [
        { teamId: "my-team-2", role: "manager", agentKey: "manager-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
        { teamId: "my-team-2", role: "worker", agentKey: "worker-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
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
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
      { role: "helper", agentKey: "helper-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const second = teamLoadReducer(first, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    expect(second.agents.size).toBe(1);
    expect(second.agents.has("my-team:general-1")).toBe(true);
    expect(second.agents.has("my-team:helper-1")).toBe(false);
  });

  test("team switch replaces the board with the new team's kanbanCards", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const withBoard: TuiState = {
      ...first,
      kanbanBoard: [{ id: "#1", content: "carry-over", status: "in_progress" }],
      kanbanCursor: "#1",
    };
    const switched = teamLoadReducer(withBoard, {
      id: "my-team-2",
      leaderKey: "worker-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team-2", role: "worker", agentKey: "worker-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    });
    expect(switched.kanbanBoard).toEqual([]);
    expect(switched.kanbanCursor).toBeNull();
  });

  test("team load replaces the board from TeamInfo.kanbanCards", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const staleBoard: TuiState = {
      ...first,
      kanbanBoard: [{ id: "#1", content: "stale", status: "pending" }],
      kanbanCursor: "#1",
    };
    const second = teamLoadReducer(staleBoard, {
      ...team([
        { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
      ]),
      kanbanCards: [{ id: "#1", content: "still here", status: "pending" }],
    });
    expect(second.kanbanBoard).toEqual([{ id: "#1", content: "still here", status: "pending" }]);
    expect(second.kanbanCursor).toBe("#1");
  });

  test("team switch clears kanban edit and expand; a same-team reload preserves them", () => {
    const agents = [{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }];
    const first = teamLoadReducer(INITIAL_TUI_STATE, team(agents));
    const engaged: TuiState = { ...first, kanbanEdit: "#1", kanbanExpanded: true };
    const switched = teamLoadReducer(engaged, {
      id: "my-team-2",
      leaderKey: "worker-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "my-team-2", role: "worker", agentKey: "worker-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    });
    expect(switched.kanbanEdit).toBeNull();
    expect(switched.kanbanExpanded).toBe(false);
    const reloaded = teamLoadReducer(engaged, team(agents));
    expect(reloaded.kanbanEdit).toBe("#1");
    expect(reloaded.kanbanExpanded).toBe(true);
  });

  test("team load clears the interrupted marker", () => {
    const first = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const marked: TuiState = { ...first, interruptedAgentId: "my-team:general-1" };
    const second = teamLoadReducer(marked, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    expect(second.interruptedAgentId).toBeNull();
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
function compactionSummary(summary: string, tokensBefore: number): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore, timestamp: 0 };
}
function usage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("teamLoadReducer — resume hydration from TeamInfo.history", () => {
  test("non-empty messages hydrate the matching agent's currentTurn", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
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
      seq: 0,
    });
  });

  test("earlier turns rotate into history on team load", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{
        agentKey: "general-1",
        messages: [
          user("first"), assistantText("a1"),
          user("second"), assistantText("a2"),
        ],
      }],
    });
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history).toHaveLength(1);
    expect(agent?.history[0]?.userPrompt).toBe("first");
    expect(agent?.currentTurn?.userPrompt).toBe("second");
  });

  test("empty messages preserve an existing slot (switchTeam identity must not clobber live state)", () => {
    const seeded = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    const existing = seeded.agents.get("my-team:general-1");
    if (existing === undefined) throw new Error("seed missing");
    const streamingTurn = { userPrompt: "live", cards: [], blocks: [{ kind: "text" as const, text: "streaming…" }], streamId: 1, seq: 0 };
    const liveAgents = new Map(seeded.agents);
    liveAgents.set("my-team:general-1", { ...existing, currentTurn: streamingTurn });
    const withLive: TuiState = { ...seeded, agents: liveAgents };
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const after = teamLoadReducer(withLive, { ...info, history: [{ agentKey: "general-1", messages: [] }] });
    expect(after.agents.get("my-team:general-1")?.currentTurn).toBe(streamingTurn);
  });

  test("history for an agentKey absent from the payload is skipped without creating a slot", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{ agentKey: "ghost-1", messages: [user("boo"), assistantText("gone")] }],
    });
    expect(state.agents.size).toBe(1);
    expect(state.agents.has("my-team:ghost-1")).toBe(false);
  });

  test("contextTokensUsed is estimated from the hydrated content", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{ agentKey: "general-1", messages: [user("count me"), assistantText("twelve chars")] }],
    });
    expect(state.agents.get("my-team:general-1")?.contextTokensUsed).toBeGreaterThan(0);
  });

  test("hydrated turns are numbered sequentially and nextEntrySeq advances past them", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{
        agentKey: "general-1",
        messages: [user("first"), assistantText("a1"), user("second"), assistantText("a2")],
      }],
    });
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.history[0]?.seq).toBe(0);
    expect(agent?.currentTurn?.seq).toBe(1);
    expect(state.nextEntrySeq).toBe(2);
  });

  test("a leading compaction summary wires the marker and numbers turns after it", () => {
    const info = team([{ role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }]);
    const state = teamLoadReducer(INITIAL_TUI_STATE, {
      ...info,
      history: [{
        agentKey: "general-1",
        messages: [compactionSummary("the summary", 500), user("kept"), assistantText("a1")],
      }],
    });
    const agent = state.agents.get("my-team:general-1");
    expect(agent?.compactionMarker).toEqual({ seq: 0, summary: "the summary", tokensBefore: 500 });
    expect(agent?.currentTurn?.seq).toBe(1);
    expect(state.nextEntrySeq).toBe(2);
  });

  test("a fresh agent starts without a compaction marker", () => {
    const state = teamLoadReducer(INITIAL_TUI_STATE, team([
      { role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    ]));
    expect(state.agents.get("my-team:general-1")?.compactionMarker).toBeNull();
  });
});

