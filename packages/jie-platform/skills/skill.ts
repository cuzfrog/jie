import type { Skill } from "./types";

export interface SkillFields {
  readonly name: string;
  readonly description: string;
  readonly argumentHint: string | null;
  readonly filePath: string;
  readonly baseDir: string;
  readonly body: string;
}

export function createSkill(fields: SkillFields): Skill {
  return {
    ...fields,
    expandInvocation(args: string): string {
      const interpolates = usesArgumentPlaceholders(fields.body);
      const body = interpolates ? interpolateArguments(fields.body, args) : fields.body;
      const block =
        `<skill name="${fields.name}" location="${fields.filePath}">\n`
        + `References are relative to ${fields.baseDir}.\n\n${body}\n</skill>`;
      return !interpolates && args !== "" ? `${block}\n\n${args}` : block;
    },
    promptEntry(): string {
      return [
        "  <skill>",
        `    <name>${escapeXml(fields.name)}</name>`,
        `    <description>${escapeXml(fields.description)}</description>`,
        `    <location>${escapeXml(fields.filePath)}</location>`,
        "  </skill>",
      ].join("\n");
    },
  };
}

function usesArgumentPlaceholders(body: string): boolean {
  return /\$ARGUMENTS\b|\$\d+\b/.test(body);
}

function interpolateArguments(body: string, args: string): string {
  const parts = args === "" ? [] : args.split(/\s+/);
  return body.replace(/\$ARGUMENTS\b|\$(\d+)\b/g, (_match, index: string | undefined) =>
    index === undefined ? args : parts[Number(index) - 1] ?? "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
