import type { Skill } from "../skills";

export interface ComposeSystemPromptInput {
  readonly rolePrompt: string;
  readonly contextBlock?: string;
  readonly memoryBlock?: string;
  readonly skills?: ReadonlyArray<Skill>;
}

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const skillsBlock = input.skills === undefined ? "" : formatSkillsBlock(input.skills);
  const prefix = blockPrefix(input.contextBlock, input.memoryBlock);
  return `${prefix}${input.rolePrompt}${skillsBlock}`;
}

function blockPrefix(...blocks: Array<string | undefined>): string {
  const nonEmpty = blocks.filter((block): block is string => block !== undefined && block !== "");
  if (nonEmpty.length === 0) return "";
  return `${nonEmpty.join("\n\n")}\n\n`;
}

function formatSkillsBlock(skills: ReadonlyArray<Skill>): string {
  const deduped = dedupeByName(skills);
  if (deduped.length === 0) return "";
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read_file tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of deduped) lines.push(skill.promptEntry());
  lines.push("</available_skills>");
  return lines.join("\n");
}

function dedupeByName(skills: ReadonlyArray<Skill>): Skill[] {
  const seen = new Map<string, Skill>();
  for (const skill of skills) {
    if (!seen.has(skill.name)) seen.set(skill.name, skill);
  }
  return [...seen.values()];
}
