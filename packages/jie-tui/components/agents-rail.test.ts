import {
  AgentsRail,
  _agentsRailFromState,
  _buildSelectItems,
  _projectRailItems,
  type RailItem,
} from "./agents-rail";
import type { AgentId, AgentUiState, TuiState } from "../state";

const AGENT_ID_1 = "default:general-1" as const;
const AGENT_ID_2 = "default:researcher-1" as const;
const AGENT_ID_3 = "default:general-2" as const;

function makeAgent(overrides: Partial<AgentUiState> = {}): AgentUiState {
  return {
    agentId: AGENT_ID_1,
    teamId: "default",
    agentKey: "general-1",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
    lastStopReason: null,
    ...overrides,
  };
}

function makeState(agents: AgentUiState[], focusedAgentId: AgentUiState["agentId"] | null): TuiState {
  const map = new Map<AgentUiState["agentId"], AgentUiState>();
  for (const a of agents) map.set(a.agentId, a);
  return {
    teamId: "default",
    leaderAgentId: null,
    agents: map,
    focusedAgentId,
    transientMessage: null,
    errorBanner: null,
    pendingQuit: false,
    showTeamRailPanel: true,
  };
}

describe("projectRailItems", () => {
  test("projects every agent into a RailItem", () => {
    const state = makeState(
      [
        makeAgent({ agentId: AGENT_ID_1, agentKey: "general-1", isLeader: true, status: "busy" }),
        makeAgent({ agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" }),
      ],
      null,
    );
    const items = _projectRailItems(state.agents);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual<RailItem>({
      agentId: AGENT_ID_1,
      agentKey: "general-1",
      role: "general",
      isLeader: true,
      status: "busy",
    });
    expect(items[1]).toEqual<RailItem>({
      agentId: AGENT_ID_2,
      agentKey: "researcher-1",
      role: "researcher",
      isLeader: false,
      status: "idle",
    });
  });

  test("returns empty array when state has no agents", () => {
    expect(_projectRailItems(new Map())).toEqual([]);
  });
});

describe("buildAgentSelectItems", () => {
  test("renders busy agents with filled glyph, idle with hollow", () => {
    const items: RailItem[] = [
      { agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "busy" },
      { agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" },
    ];
    const out = _buildSelectItems(items);
    expect(out[0].label).toBe("● ★ general");
    expect(out[0].description).toBe("general-1");
    expect(out[0].value).toBe(AGENT_ID_1);
    expect(out[1].label).toBe("○   researcher");
  });
});

describe("AgentsRail", () => {
  test("renders one line per agent with the right glyphs", () => {
    const rail = new AgentsRail(20);
    rail.setItems(
      [
        { agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "busy" },
        { agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" },
      ],
      AGENT_ID_1,
    );
    const lines = rail.render(40);
    const flat = lines.join("\n");
    expect(flat).toContain("general");
    expect(flat).toContain("researcher");
    expect(flat).toContain("●");
    expect(flat).toContain("○");
  });

  test("getSelectedAgentId returns the focused agent's id", () => {
    const rail = new AgentsRail(20);
    rail.setItems(
      [
        { agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "idle" },
        { agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" },
        { agentId: AGENT_ID_3, agentKey: "general-2", role: "general", isLeader: false, status: "idle" },
      ],
      AGENT_ID_2,
    );
    expect(rail.getSelectedAgentId()).toBe(AGENT_ID_2);
  });

  test("falls back to index 0 when focused agent is unknown", () => {
    const rail = new AgentsRail(20);
    const GHOST: AgentId = "ghost:missing";
    rail.setItems(
      [{ agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "idle" }],
      GHOST,
    );
    expect(rail.getSelectedAgentId()).toBe(AGENT_ID_1);
  });

  test("setItems rebuilds the rail with the new items", () => {
    const rail = new AgentsRail(20);
    rail.setItems(
      [{ agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "idle" }],
      null,
    );
    expect(rail.getSelectedAgentId()).toBe(AGENT_ID_1);

    rail.setItems(
      [
        { agentId: AGENT_ID_1, agentKey: "general-1", role: "general", isLeader: true, status: "idle" },
        { agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" },
      ],
      AGENT_ID_2,
    );
    expect(rail.getSelectedAgentId()).toBe(AGENT_ID_2);
  });
});

describe("agentsRailFromState", () => {
  test("projects the full state map and selects the focused agent", () => {
    const state = makeState(
      [
        makeAgent({ agentId: AGENT_ID_1, agentKey: "general-1", isLeader: true, status: "busy" }),
        makeAgent({ agentId: AGENT_ID_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" }),
      ],
      AGENT_ID_2,
    );
    const rail = _agentsRailFromState(state);
    expect(rail.getSelectedAgentId()).toBe(AGENT_ID_2);
    const lines = rail.render(40).join("\n");
    expect(lines).toContain("general");
    expect(lines).toContain("researcher");
  });
});
