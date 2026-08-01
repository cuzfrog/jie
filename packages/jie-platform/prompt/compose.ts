import type { Skill } from "../skills";
import { formatSkillsForPrompt } from "../skills";

export interface ComposeSystemPromptInput {
  readonly rolePrompt: string;
  readonly skills?: ReadonlyArray<Skill>;
}

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const skillsBlock = input.skills === undefined ? "" : formatSkillsForPrompt(input.skills);
  return `${input.rolePrompt}${skillsBlock}`;
}
