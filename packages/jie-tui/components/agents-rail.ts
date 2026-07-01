import { Container, SelectList, type SelectItem } from "@earendil-works/pi-tui";
import type { AgentId, AgentUiState, TuiState } from "../state";
import { selectListTheme } from "./themes";

const RAIL_MAX_VISIBLE = 20;

export interface RailItem {
  readonly agentId: AgentId;
  readonly agentKey: string;
  readonly role: string;
  readonly isLeader: boolean;
  readonly status: "idle" | "busy";
}

export function projectRailItems(agents: ReadonlyMap<AgentId, AgentUiState>): RailItem[] {
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

export function buildAgentSelectItems(items: ReadonlyArray<RailItem>): SelectItem[] {
  return items.map((item) => {
    const glyph = item.status === "busy" ? "● " : "○ ";
    const leaderMarker = item.isLeader ? "★ " : "  ";
    return {
      value: item.agentId,
      label: `${glyph}${leaderMarker}${item.agentKey}`,
      description: item.role,
    };
  });
}

export class AgentsRail extends Container {
  private items: SelectList;
  private readonly maxVisible: number;

  constructor(maxVisible: number = RAIL_MAX_VISIBLE) {
    super();
    this.maxVisible = maxVisible;
    this.items = new SelectList([], this.maxVisible, selectListTheme);
  }

  setItems(railItems: ReadonlyArray<RailItem>, focusedAgentId: AgentId | null): void {
    const selectItems = buildAgentSelectItems(railItems);
    this.items = new SelectList(selectItems, this.maxVisible, selectListTheme);
    if (railItems.length === 0) return;
    const focusedIndex = focusedAgentId === null
      ? 0
      : railItems.findIndex((i) => i.agentId === focusedAgentId);
    const safeIndex = focusedIndex >= 0 ? focusedIndex : 0;
    this.items.setSelectedIndex(safeIndex);
  }

  getSelectedAgentId(): AgentId | null {
    const item = this.items.getSelectedItem();
    return item === null ? null : (item.value as AgentId);
  }

  render(width: number): string[] {
    return this.items.render(width);
  }

  invalidate(): void {
    this.items.invalidate();
  }
}

export function agentsRailFromState(state: TuiState, maxVisible?: number): AgentsRail {
  const rail = new AgentsRail(maxVisible);
  rail.setItems(projectRailItems(state.agents), state.focusedAgentId);
  return rail;
}
