import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageTurn } from "../../state";
import { USER_PROMPT_PREFIX, style } from "../themes";

export class UserMessage implements Component {
  private prompt: string;

  constructor(prompt: string) {
    this.prompt = prompt;
  }

  update(turn: MessageTurn): void {
    this.prompt = turn.userPrompt;
  }

  render(width: number): string[] {
    if (this.prompt === "") return [];
    const line = style("userMessageIcon")(USER_PROMPT_PREFIX) + this.prompt;
    return wrapTextWithAnsi(line, Math.max(1, width));
  }

  invalidate(): void {}
}
