import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { AgentsRail, type RailItem } from "./agents-rail";
import type { AgentId } from "../state";

const COLS = 80;
const ROWS = 24;

const AGENT_1: AgentId = "demo:general-1";
const AGENT_2: AgentId = "demo:researcher-1";

const ITEMS: RailItem[] = [
  { agentId: AGENT_1, agentKey: "general-1", role: "general", isLeader: true, status: "busy" },
  { agentId: AGENT_2, agentKey: "researcher-1", role: "researcher", isLeader: false, status: "idle" },
];

async function renderRail(items: RailItem[], focused: AgentId | null): Promise<string[]> {
  const terminal = new VirtualTerminal(COLS, ROWS);
  const rail = new AgentsRail(20);
  rail.setItems(items, focused);
  terminal.start(() => {}, () => {});
  for (const line of rail.render(COLS)) {
    terminal.write(line + "\n");
  }
  return terminal.flushAndGetViewport();
}

function nonEmpty(viewport: string[]): string[] {
  return viewport.filter((line) => line.trim() !== "");
}

describe("AgentsRail — view", () => {
  test("renders one row per agent", async () => {
    const viewport = await renderRail(ITEMS, AGENT_1);
    const flat = viewport.join("\n");
    expect(flat).toContain("general");
    expect(flat).toContain("researcher");
  });

  test("leader row carries the leader marker", async () => {
    const viewport = await renderRail(ITEMS, AGENT_1);
    expect(viewport.some((line) => line.includes("★"))).toBe(true);
  });

  test("busy and idle glyphs both appear in the viewport", async () => {
    const viewport = await renderRail(ITEMS, AGENT_1);
    const flat = viewport.join("\n");
    expect(flat).toContain("●");
    expect(flat).toContain("○");
  });

  test("each agent row includes the role label", async () => {
    const viewport = await renderRail(ITEMS, AGENT_1);
    const flat = viewport.join("\n");
    expect(flat).toContain("general");
    expect(flat).toContain("researcher");
  });

  test("empty rail renders no agent rows", async () => {
    const viewport = await renderRail([], null);
    const visible = nonEmpty(viewport).join("\n");
    expect(visible).not.toContain("general");
    expect(visible).not.toContain("researcher");
  });

  test("viewport has at most one entry per item plus a scroll-info row", async () => {
    const viewport = await renderRail(ITEMS, AGENT_1);
    const visibleLines = nonEmpty(viewport);
    expect(visibleLines.length).toBeLessThanOrEqual(3);
  });
});
