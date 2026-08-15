import type { AgentUiState, MessageBlock, MessageCard, MessageTurn } from "./state";

export function contextHistory(agent: AgentUiState): ReadonlyArray<MessageTurn> {
  if (agent.compactionMarker === null) return [...agent.history];
  return agent.history.slice(agent.compactionMarker.turnsBefore);
}

export function estimateContextTokens(history: ReadonlyArray<MessageTurn>, currentTurn: MessageTurn | null): number {
  let chars = 0;
  for (const turn of history) {
    chars += turn.userPrompt.length;
    for (const entry of turn.entries) chars += entryLength(entry);
  }
  if (currentTurn !== null) {
    chars += currentTurn.userPrompt.length;
    for (const entry of currentTurn.entries) chars += entryLength(entry);
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

const CHARS_PER_TOKEN = 4;

function entryLength(entry: MessageBlock | MessageCard): number {
  switch (entry.kind) {
    case "toolCall":
    case "toolResult": {
      let total = 0;
      if (entry.input !== undefined) total += entry.input.length;
      if (entry.output !== null && entry.output !== undefined) total += entry.output.length;
      if (entry.error !== null && entry.error !== undefined) total += entry.error.length;
      return total;
    }
    default:
      return entry.text.length;
  }
}
