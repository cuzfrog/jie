import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageTurn } from "../../state";
import { USER_PROMPT_PREFIX, style } from "../themes";

const SKILL_PROMPT_PREFIX = "/skill:";
const SKILL_INVOCATION_ICON = "⚡ ";

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
    const line = this.prompt.startsWith(SKILL_PROMPT_PREFIX)
      ? style("userMessageIcon")(USER_PROMPT_PREFIX + SKILL_INVOCATION_ICON) + this.prompt.slice(SKILL_PROMPT_PREFIX.length)
      : style("userMessageIcon")(USER_PROMPT_PREFIX) + this.prompt;
    return wrapTextWithAnsi(line, Math.max(1, width));
  }

  invalidate(): void {}
}
