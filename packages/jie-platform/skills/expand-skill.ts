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
  const interpolates = usesArgumentPlaceholders(skill.body);
  const body = interpolates ? interpolateArguments(skill.body, args) : skill.body;
  const block =
    `<skill name="${skill.name}" location="${skill.filePath}">\n`
    + `References are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
  return !interpolates && args !== "" ? `${block}\n\n${args}` : block;
}

function usesArgumentPlaceholders(body: string): boolean {
  return /\$ARGUMENTS\b|\$\d+\b/.test(body);
}

function interpolateArguments(body: string, args: string): string {
  const parts = args === "" ? [] : args.split(/\s+/);
  return body.replace(/\$ARGUMENTS\b|\$(\d+)\b/g, (_match, index: string | undefined) =>
    index === undefined ? args : parts[Number(index) - 1] ?? "");
}
