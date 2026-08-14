import type { Skill } from "../skills";

export interface ComposeSystemPromptInput {
  readonly rolePrompt: string;
  readonly cwd: string;
  readonly contextBlock?: string;
  readonly memoryBlock?: string;
  readonly skills?: ReadonlyArray<Skill>;
  readonly tools?: ReadonlyArray<{ readonly name: string; readonly description: string }>;
}

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const promptCwd = input.cwd.replace(/\\/g, "/");
  const sections: string[] = [input.rolePrompt];

  const tools = input.tools ?? [];
  const toolLines = tools.length === 0 ? "(none)" : tools.map((tool) => `- ${tool.name}: ${toolSnippet(tool.description)}`).join("\n");
  sections.push(`Available tools:\n${toolLines}`);

  const names = new Set(tools.map((tool) => tool.name));
  const hasBash = names.has("bash");
  const hasGrep = names.has("grep_file");
  const hasFind = names.has("find_file");
  const hasLs = names.has("ls");
  const guidelineSet = new Set<string>();
  if (hasBash && !hasGrep && !hasFind && !hasLs) {
    guidelineSet.add("Use bash for file operations like ls, rg, find");
  }
  guidelineSet.add("Be concise in your responses");
  guidelineSet.add("Show file paths clearly when working with files");

  const guidelines = [...guidelineSet].map((g) => `- ${g}`).join("\n");
  sections.push(`Guidelines:\n${guidelines}`);

  if (input.contextBlock !== undefined && input.contextBlock !== "") {
    sections.push(input.contextBlock);
  }

  const skillsBlock = input.skills === undefined ? "" : formatSkillsBlock(input.skills);
  if (skillsBlock !== "") {
    sections.push(skillsBlock);
  }

  if (input.memoryBlock !== undefined && input.memoryBlock !== "") {
    sections.push(input.memoryBlock);
  }

  sections.push(`Current working directory: ${promptCwd}`);

  return sections.join("\n\n");
}

function toolSnippet(description: string): string {
  const sentenceBreak = description.indexOf(". ");
  const lineBreak = description.indexOf("\n");
  if (sentenceBreak !== -1 && (lineBreak === -1 || sentenceBreak < lineBreak)) {
    return description.slice(0, sentenceBreak + 2).trimEnd();
  }
  if (lineBreak !== -1) {
    return description.slice(0, lineBreak).trimEnd();
  }
  return description.trimEnd();
}

function formatSkillsBlock(skills: ReadonlyArray<Skill>): string {
  const deduped = dedupeByName(skills);
  if (deduped.length === 0) return "";
  const lines = [
    "The following skills provide specialized instructions for specific tasks.",
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
