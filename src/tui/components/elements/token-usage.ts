import type { AgentUiState } from "../../state";
import { style } from "../themes";
import { contextPercentColor, formatContextPercent } from "./context-percent";

export interface TokenUsage {
  format(agent: AgentUiState | null): string;
}

export class TokenUsageImpl implements TokenUsage {
  format(agent: AgentUiState | null): string {
    if (agent === null || agent.model === null) return style("muted")("—");
    const usage = `${formatCompactNumber(agent.uploadTokens)}↑ ${formatCompactNumber(agent.downloadTokens)}↓`;
    const text = `${formatContextPercent(agent.contextTokensUsed, agent.model.contextWindow)} ${usage}`;
    return style(contextPercentColor(agent.contextTokensUsed, agent.model.contextWindow))(text);
  }
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}
