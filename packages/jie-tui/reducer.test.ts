import type { EventEnvelope, Sender } from "@cuzfrog/jie-platform/event";
import { Events } from "@cuzfrog/jie-platform/event";
import { type TuiState, initialState } from "./state";
import { reduce } from "./state";

const AGENT_SENDER: Sender = { kind: "agent", identity: { teamId: "my-team", agentRole: "general", agentKey: "general-1" } };
const LEADER_SENDER: Sender = { kind: "agent", identity: { teamId: "my-team", agentRole: "general", agentKey: "general-1" } };

function loadTeam(state: TuiState, teamId: string, agents: Array<{ role: string; agent_key: string; is_leader: boolean }>): TuiState {
  return reduce(state, Events.teamLoaded({ kind: "cli" }, teamId, agents));
}

describe("reduce — initial state invariants", () => {
  test("initial state has empty agent map, hidden rail, no leader focus", () => {
    const s = initialState();
    expect(s.teamId).toBeNull();
    expect(s.agents.size).toBe(0);
    expect(s.showRail).toBe(false);
    expect(s.focusedAgentId).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.transientMessage).toBeNull();
    expect(s.errorBanner).toBeNull();
  });
});

describe("reduce — team.{teamId}.loaded", () => {
  test("seeds agents, focuses the leader", () => {
    const s0 = initialState();
    const s1 = loadTeam(s0, "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    expect(s1.teamId).toBe("my-team");
    expect(s1.agents.size).toBe(1);
    expect(s1.leaderAgentId).toBe("my-team:general-1");
    expect(s1.focusedAgentId).toBe("my-team:general-1");
  });

  test("team switch resets the agent map and clears leader focus", () => {
    const s1 = loadTeam(initialState(), "my-team-1", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    const s2 = loadTeam(s1, "my-team-2", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    expect(s2.teamId).toBe("my-team-2");
    expect(s2.agents.size).toBe(1);
    expect(s2.agents.has("my-team-2:general-1")).toBe(true);
    expect(s2.agents.has("my-team-1:general-1")).toBe(false);
    expect(s2.leaderAgentId).toBe("my-team-2:general-1");
  });
});

describe("reduce — ui.* local topics", () => {
  test("ui.rail.toggle flips showRail", () => {
    const s0 = initialState();
    const s1 = reduce(s0, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    const s2 = reduce(s1, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    expect(s1.showRail).toBe(true);
    expect(s2.showRail).toBe(false);
  });

  test("ui.transient sets transientMessage with shownAt", () => {
    const s1 = reduce(initialState(), { version: 1, topic: "ui.transient", sender: { kind: "tui" }, timestamp: "t", payload: { text: "logged in to nvidia", shownAt: 42 } });
    expect(s1.transientMessage).toEqual({ text: "logged in to nvidia", shownAt: 42 });
  });

  test("ui.transient.clear nulls transientMessage", () => {
    const s0 = reduce(initialState(), { version: 1, topic: "ui.transient", sender: { kind: "tui" }, timestamp: "t", payload: { text: "x", shownAt: 1 } });
    const s1 = reduce(s0, { version: 1, topic: "ui.transient.clear", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    expect(s1.transientMessage).toBeNull();
  });

  test("ui.error sets errorBanner; ui.error.clear nulls it", () => {
    const s0 = reduce(initialState(), { version: 1, topic: "ui.error", sender: { kind: "tui" }, timestamp: "t", payload: { text: "No model selected", shownAt: 1 } });
    expect(s0.errorBanner?.text).toBe("No model selected");
    const s1 = reduce(s0, { version: 1, topic: "ui.error.clear", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    expect(s1.errorBanner).toBeNull();
  });

  test("ui.clear resets agents, queue, transient, error", () => {
    let s = loadTeam(initialState(), "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    s = { ...s, queue: ["x", "y"] };
    s = reduce(s, { version: 1, topic: "ui.error", sender: { kind: "tui" }, timestamp: "t", payload: { text: "e", shownAt: 1 } });
    s = reduce(s, { version: 1, topic: "ui.transient", sender: { kind: "tui" }, timestamp: "t", payload: { text: "t", shownAt: 1 } });
    const cleared = reduce(s, { version: 1, topic: "ui.clear", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    expect(cleared.agents.size).toBe(0);
    expect(cleared.queue).toEqual([]);
    expect(cleared.transientMessage).toBeNull();
    expect(cleared.errorBanner).toBeNull();
  });
});

describe("reduce — agent.* topics with cross-team guard", () => {
  test("agent.idle on inactive team is rejected", () => {
    const s1 = loadTeam(initialState(), "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    const foreign: EventEnvelope = {
      version: 1, topic: "agent.idle", sender: { kind: "agent", identity: { teamId: "other-team", agentRole: "general", agentKey: "general-1" } }, timestamp: "t", payload: null as unknown as Record<string, unknown>,
    };
    const s2 = reduce(s1, foreign);
    expect(s2).toBe(s1);
  });

  test("agent.turn.start on focused agent clears errorBanner (T4 path)", () => {
    let s = loadTeam(initialState(), "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    s = reduce(s, { version: 1, topic: "ui.error", sender: { kind: "tui" }, timestamp: "t", payload: { text: "No model", shownAt: 1 } });
    expect(s.errorBanner?.text).toBe("No model");
    const s2 = reduce(s, Events.agentTurnStart(LEADER_SENDER));
    expect(s2.errorBanner).toBeNull();
    expect(s2.agents.get("my-team:general-1")?.status).toBe("busy");
  });

  test("agent.idle sets status idle and stamps lastIdleAt", () => {
    let s = loadTeam(initialState(), "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
    s = reduce(s, Events.agentTurnStart(AGENT_SENDER));
    expect(s.agents.get("my-team:general-1")?.status).toBe("busy");
    const s2 = reduce(s, Events.agentIdle(AGENT_SENDER));
    const a = s2.agents.get("my-team:general-1");
    expect(a?.status).toBe("idle");
    expect(typeof a?.lastIdleAt).toBe("number");
    expect(a?.lastIdleAt).toBeGreaterThan(0);
  });
});

describe("reduce — streaming and tool cards", () => {
  function setup(): TuiState {
    return loadTeam(initialState(), "my-team", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ]);
  }

  test("agent.stream.chunk appends to current block; new block on type change", () => {
    let s = setup();
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "Hello "));
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 2, "text", "world"));
    let agent = s.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks).toEqual([
      { kind: "text", text: "Hello world", expanded: false },
    ]);
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 3, "thinking", "I think"));
    agent = s.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[1]).toEqual({ kind: "thinking", text: "I think", expanded: false });
  });

  test("new stream_id opens a fresh block", () => {
    let s = setup();
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "first "));
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 1, 2, "text", "turn"));
    s = reduce(s, Events.agentStreamChunk(AGENT_SENDER, 2, 1, "text", "second"));
    const agent = s.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.blocks.length).toBe(2);
    expect(agent?.currentTurn?.blocks[1].text).toBe("second");
  });

  test("agent.tool.call + agent.tool.result match by callId", () => {
    let s = setup();
    s = reduce(s, Events.agentToolCall(AGENT_SENDER, "c1", "bash", "ls", false));
    s = reduce(s, Events.agentToolResult(AGENT_SENDER, "c1", "bash", "out", false, 12, null));
    const agent = s.agents.get("my-team:general-1");
    expect(agent?.currentTurn?.cards.length).toBe(1);
    const card = agent?.currentTurn?.cards[0];
    expect(card?.kind).toBe("toolResult");
    if (card?.kind === "toolResult") {
      expect(card.durationMs).toBe(12);
      expect(card.output).toBe("out");
      expect(card.error).toBeNull();
    }
  });
});

describe("reduce — agent.queue.update leader filter", () => {
  test("only the leader's queue update is honored", () => {
    const s1 = loadTeam(initialState(), "my-team", [
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    const workerSender: Sender = { kind: "agent", identity: { teamId: "my-team", agentRole: "worker", agentKey: "worker-1" } };
    const s2 = reduce(s1, Events.agentQueueUpdate(workerSender, ["x"]));
    expect(s2.queue).toEqual([]);
    const leaderSender: Sender = { kind: "agent", identity: { teamId: "my-team", agentRole: "manager", agentKey: "manager-1" } };
    const s3 = reduce(s2, Events.agentQueueUpdate(leaderSender, ["queued"]));
    expect(s3.queue).toEqual(["queued"]);
  });
});

describe("reduce — ui.agent.cycle direction", () => {
  test("Ctrl+↓ direction=1 cycles forward", () => {
    const s1 = loadTeam(initialState(), "my-team", [
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    const s2 = reduce(s1, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    expect(s2.focusedAgentId).toBe("my-team:manager-1");
    const s3 = reduce(s2, { version: 1, topic: "ui.agent.cycle", sender: { kind: "tui" }, timestamp: "t", payload: { direction: 1 } });
    expect(s3.focusedAgentId).toBe("my-team:worker-1");
  });

  test("Ctrl+↑ direction=-1 cycles backward and wraps", () => {
    const s1 = loadTeam(initialState(), "my-team", [
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    const s2 = reduce(s1, { version: 1, topic: "ui.rail.toggle", sender: { kind: "tui" }, timestamp: "t", payload: null as unknown as Record<string, unknown> });
    const s3 = reduce(s2, { version: 1, topic: "ui.agent.cycle", sender: { kind: "tui" }, timestamp: "t", payload: { direction: -1 } });
    expect(s3.focusedAgentId).toBe("my-team:worker-1");
  });

  test("cycling is a no-op when the rail is hidden", () => {
    const s1 = loadTeam(initialState(), "my-team", [
      { role: "manager", agent_key: "manager-1", is_leader: true },
      { role: "worker", agent_key: "worker-1", is_leader: false },
    ]);
    expect(s1.showRail).toBe(false);
    const s2 = reduce(s1, { version: 1, topic: "ui.agent.cycle", sender: { kind: "tui" }, timestamp: "t", payload: { direction: 1 } });
    expect(s2.focusedAgentId).toBe("my-team:manager-1");
  });
});