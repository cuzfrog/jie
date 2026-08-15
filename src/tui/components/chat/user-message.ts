import { visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageTurn } from "../../state";
import { USER_PROMPT_PREFIX, style } from "../themes";

const SKILL_PROMPT_PREFIX = "/skill:";
const SKILL_INVOCATION_ICON = "⚡ ";
const ROW_BACKGROUND = "\x1b[100m";
const ROW_BACKGROUND_END = "\x1b[49m";

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
    const safeWidth = Math.max(1, width);
    const rows = wrapTextWithAnsi(line, safeWidth);
    return rows.map((row) => this.withBackground(row, safeWidth));
  }

  private withBackground(row: string, width: number): string {
    const padding = " ".repeat(Math.max(0, width - visibleWidth(row)));
    return `${ROW_BACKGROUND}${row}${padding}${ROW_BACKGROUND_END}`;
  }

  invalidate(): void {}
}
