import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type TuiState } from "../../state";
import { style } from "../themes";

export interface DynamicHint {
  format(state: TuiState, availableWidth: number): string;
}

export class DynamicHintImpl implements DynamicHint {
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  format(state: TuiState, availableWidth: number): string {
    const hints: string[] = [];
    const kanban = kanbanHint(state);
    if (kanban !== null) hints.push(kanban);
    const teamPanel = teamPanelHint(state);
    if (teamPanel !== null) hints.push(teamPanel);
    if (hints.length === 0) return helpHint();
    const joined = hints.join(" | ");
    if (visibleWidth(joined) <= availableWidth) return joined;
    const index = Math.min(hints.length - 1, Math.floor(this.random() * hints.length));
    const chosen = hints[index]!;
    return visibleWidth(chosen) <= availableWidth ? chosen : truncateToWidth(chosen, Math.max(1, availableWidth), "", false);
  }
}

function kanbanHint(state: TuiState): string | null {
  if (state.kanban.view !== "hidden") return null;
  const openCount = state.kanban.board.filter((card) => card.status !== "completed").length;
  if (openCount === 0) return null;
  return `${style("accent")("ctl+k")}${style("muted")(` for kanban(${openCount})`)}`;
}

function teamPanelHint(state: TuiState): string | null {
  if (state.teamId === null) return null;
  if (!state.editorCursorAtStart) return null;
  return `${style("accent")("\u2190")}${style("muted")(" to toggle team panel")}`;
}

function helpHint(): string {
  return `${style("accent")("/help")}${style("muted")(" to show commands and shortcuts")}`;
}
