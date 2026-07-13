import type { MessageTurn } from "./state";

export function estimateContextTokens(history: ReadonlyArray<MessageTurn>, currentTurn: MessageTurn | null): number {
  let chars = 0;
  for (const turn of history) {
    chars += turn.userPrompt.length;
    chars += blockLength(turn.blocks);
    chars += cardLength(turn.cards);
  }
  if (currentTurn !== null) {
    chars += currentTurn.userPrompt.length;
    chars += blockLength(currentTurn.blocks);
    chars += cardLength(currentTurn.cards);
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

const CHARS_PER_TOKEN = 4;

function blockLength(blocks: ReadonlyArray<{ readonly text: string }>): number {
  let total = 0;
  for (const block of blocks) {
    total += block.text.length;
  }
  return total;
}

function cardLength(cards: ReadonlyArray<{ readonly input?: string; readonly output?: string | null; readonly error?: string | null }>): number {
  let total = 0;
  for (const card of cards) {
    if (card.input !== undefined) total += card.input.length;
    if (card.output !== null && card.output !== undefined) total += card.output.length;
    if (card.error !== null && card.error !== undefined) total += card.error.length;
  }
  return total;
}