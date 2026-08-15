import type { AgentUiState } from "../../state";
import { style } from "../themes";

export interface CompactingIndicator {
  format(agent: AgentUiState | null): string | null;
}

export class CompactingIndicatorImpl implements CompactingIndicator {
  format(agent: AgentUiState | null): string | null {
    return agent !== null && agent.compactionInProgress ? style("warning")("Compacting...") : null;
  }
}
