import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { AgentUiState } from "../../state";
import { style } from "../themes";

export class CompactionMarkerMessage implements Component {
  private marker: NonNullable<AgentUiState["compactionMarker"]>;

  constructor(marker: NonNullable<AgentUiState["compactionMarker"]>) {
    this.marker = marker;
  }

  update(marker: NonNullable<AgentUiState["compactionMarker"]>): void {
    this.marker = marker;
  }

  render(width: number): string[] {
    const effectiveWidth = Math.max(1, width);
    const header = style("dim")(`context compacted · ${this.marker.tokensBefore} tokens summarized`);
    return [...wrapTextWithAnsi(header, effectiveWidth), ...wrapTextWithAnsi(this.marker.summary, effectiveWidth)];
  }

  invalidate(): void {}
}
