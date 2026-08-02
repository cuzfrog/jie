import { parse as parseYaml } from "yaml";
import type { Skill } from "./types";

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export interface ParseSkillInput {
  readonly dirName: string;
  readonly baseDir: string;
  readonly filePath: string;
  readonly content: string;
}

export interface ParseSkillResult {
  readonly skill: Skill | null;
  readonly diagnostic: string | null;
}

export function parseSkill(input: ParseSkillInput): ParseSkillResult {
  const nameError = validateName(input.dirName);
  if (nameError !== null) return { skill: null, diagnostic: nameError };

  let frontmatter: Record<string, unknown>;
  let body: string;
  try {
    ({ frontmatter, body } = parseFrontmatter(input.content));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { skill: null, diagnostic: `invalid frontmatter: ${message}` };
  }

  if (frontmatter.name !== undefined && frontmatter.name !== input.dirName) {
    return {
      skill: null,
      diagnostic: `skill name '${String(frontmatter.name)}' must match the directory name '${input.dirName}'`,
    };
  }

  const descriptionError = validateDescription(frontmatter.description);
  if (descriptionError !== null) return { skill: null, diagnostic: descriptionError };

  const skill: Skill = {
    name: input.dirName, description: String(frontmatter.description), filePath: input.filePath, baseDir: input.baseDir, body: body.trim(),
  };
  return { skill, diagnostic: null };
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, body: content };
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) return { frontmatter: {}, body: content };
  const parsed: unknown = parseYaml(lines.slice(1, closingIndex).join("\n"));
  return { frontmatter: isObject(parsed) ? parsed : {}, body: lines.slice(closingIndex + 1).join("\n") };
}

function validateName(name: string): string | null {
  if (name.length > MAX_NAME_LENGTH) {
    return `skill name '${name}' exceeds ${MAX_NAME_LENGTH} characters`;
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    return `skill name '${name}' must be lowercase a-z, 0-9, and hyphens only`;
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return `skill name '${name}' must not start or end with a hyphen`;
  }
  if (name.includes("--")) {
    return `skill name '${name}' must not contain consecutive hyphens`;
  }
  return null;
}

function validateDescription(description: unknown): string | null {
  if (typeof description !== "string" || description.trim() === "") {
    return "skill description is required";
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters`;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
