import { type TeamInfo } from "@cuzfrog/jie-platform";
import { teamLoadReducer } from "./team-load-reducer";
import { createStateStore } from "./state-store";
import type { TuiState } from "./state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const INITIAL_TUI_STATE: TuiState = createStateStore().getState();

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
    const withTodos: TuiState = {
      ...first,
      agents: new Map(first.agents),
    };
    const withTodosAgent = withTodos.agents.get("my-team:general-1");
    if (withTodosAgent === undefined) throw new Error("seed missing");
    withTodos.agents.set("my-team:general-1", { ...withTodosAgent, todos: [{ content: "carry-over", status: "in_progress" }] });
    const switched = teamLoadReducer(withTodos, {
      id: "my-team-2",
      leaderKey: "worker-1",
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
    const withTodos: TuiState = {
      ...first,
      agents: new Map(first.agents),
    };
    withTodos.agents.set("my-team:general-1", { ...firstAgent, todos: [{ content: "still here", status: "pending" }] });
    const second = teamLoadReducer(withTodos, team([
      { role: "general", agentKey: "general-1", isLeader: true, model: null },
    ]));
    expect(second.agents.get("my-team:general-1")?.todos).toEqual([{ content: "still here", status: "pending" }]);
  });
});
