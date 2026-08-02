import type { Skill } from "./types";

const SKILL_INVOCATION_PREFIX = "/skill:";

export function expandSkillInvocation(text: string, skills: ReadonlyArray<Skill>): string | null {
  if (!text.startsWith(SKILL_INVOCATION_PREFIX)) return null;
  const rest = text.slice(SKILL_INVOCATION_PREFIX.length);
  const separatorIndex = rest.search(/\s/);
  const name = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
  if (name === "") return null;
  const skill = skills.find((candidate) => candidate.name === name);
  if (skill === undefined) return null;
  const args = separatorIndex === -1 ? "" : rest.slice(separatorIndex + 1).trim();
  const block =
    `<skill name="${skill.name}" location="${skill.filePath}">\n`
    + `References are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
  return args === "" ? block : `${block}\n\n${args}`;
}
