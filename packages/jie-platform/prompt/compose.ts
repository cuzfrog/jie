import type { Skill } from "../skills";
import { formatSkillsForPrompt } from "../skills";

export interface ComposeSystemPromptInput {
  readonly rolePrompt: string;
  readonly contextBlock?: string;
  readonly skills?: ReadonlyArray<Skill>;
}

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const skillsBlock = input.skills === undefined ? "" : formatSkillsForPrompt(input.skills);
  const prefix = input.contextBlock === undefined || input.contextBlock === "" ? "" : `${input.contextBlock}\n\n`;
  return `${prefix}${input.rolePrompt}${skillsBlock}`;
}
