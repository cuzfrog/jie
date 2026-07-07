import { Container, SelectList, type SelectItem } from "@earendil-works/pi-tui";
import type { AgentId, AgentUiState, TuiState } from "../state";
import { Themes } from "./themes";

const RAIL_MAX_VISIBLE = 20;
const BUSY_GLYPH = "● ";
const IDLE_GLYPH = "○ ";
const LEADER_GLYPH = "★ ";
const NON_LEADER_GLYPH = "  ";

export interface RailItem {
  readonly agentId: AgentId;
  readonly agentKey: string;
  readonly role: string;
  readonly isLeader: boolean;
  readonly status: "idle" | "busy";
}

export class AgentsRail extends Container {
  private items: SelectList;
  private readonly maxVisible: number;
  private railItems: ReadonlyArray<RailItem>;
  private selectedIndex: number;
  private lastFocusedAgentId: AgentId | null;

  constructor(maxVisible: number = RAIL_MAX_VISIBLE) {
    super();
    this.maxVisible = maxVisible;
    this.railItems = [];
    this.selectedIndex = 0;
    this.lastFocusedAgentId = null;
    this.items = new SelectList([], this.maxVisible, Themes.editorTheme.selectList);
  }

  setItems(railItems: ReadonlyArray<RailItem>, focusedAgentId: AgentId | null): void {
    this.railItems = railItems;
    const selectItems = buildSelectItems(railItems);
    this.items = new SelectList(selectItems, this.maxVisible, Themes.editorTheme.selectList);
    if (railItems.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    const focusedIndex = focusedAgentId === null
      ? 0
      : railItems.findIndex((i) => i.agentId === focusedAgentId);
    const safeIndex = focusedIndex >= 0 ? focusedIndex : 0;
    this.selectedIndex = safeIndex;
    this.items.setSelectedIndex(safeIndex);
  }

  setItemsFromState(state: TuiState): void {
    const nextItems = projectRailItems(state.agents);
    if (railItemsEqual(this.railItems, nextItems) && this.lastFocusedAgentId === state.focusedAgentId) return;
    this.lastFocusedAgentId = state.focusedAgentId;
    this.setItems(nextItems, state.focusedAgentId);
  }

  getSelectedAgentId(): AgentId | null {
    return this.railItems[this.selectedIndex]?.agentId ?? null;
  }

  render(width: number): string[] {
    return this.items.render(width);
  }

  invalidate(): void {
    this.items.invalidate();
  }
}

function projectRailItems(agents: ReadonlyMap<AgentId, AgentUiState>): RailItem[] {
  const items: RailItem[] = [];
  for (const agent of agents.values()) {
    items.push({
      agentId: agent.agentId,
      agentKey: agent.agentKey,
      role: agent.role,
      isLeader: agent.isLeader,
      status: agent.status,
    });
  }
  return items;
}

function railItemsEqual(a: ReadonlyArray<RailItem>, b: ReadonlyArray<RailItem>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.agentKey !== b[i]!.agentKey) return false;
    if (a[i]!.role !== b[i]!.role) return false;
    if (a[i]!.isLeader !== b[i]!.isLeader) return false;
    if (a[i]!.status !== b[i]!.status) return false;
  }
  return true;
}

function buildSelectItems(items: ReadonlyArray<RailItem>): SelectItem[] {
  return items.map((item) => {
    const glyph = item.status === "busy" ? BUSY_GLYPH : IDLE_GLYPH;
    const leaderMarker = item.isLeader ? LEADER_GLYPH : NON_LEADER_GLYPH;
    return {
      value: item.agentId,
      label: `${glyph}${leaderMarker}${item.role}`,
      description: item.agentKey,
    };
  });
}

function agentsRailFromState(state: TuiState): AgentsRail {
  const rail = new AgentsRail();
  rail.setItems(projectRailItems(state.agents), state.focusedAgentId);
  return rail;
}

export {
  projectRailItems as _projectRailItems,
  buildSelectItems as _buildSelectItems,
  agentsRailFromState as _agentsRailFromState,
};
