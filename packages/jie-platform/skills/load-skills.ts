import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { LoadSkillsResult, Skill, SkillDiagnostic } from "./types";

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const SKILL_FILE = "SKILL.md";

export interface LoadSkillsOptions {
  readonly homeSkillsDir: string;
  readonly projectSkillsDir: string | null;
}

export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
  const diagnostics: SkillDiagnostic[] = [];
  const byName = new Map<string, Skill>();

  collectSkillsFromDir(options.homeSkillsDir, byName, diagnostics);
  if (options.projectSkillsDir !== null) {
    collectSkillsFromDir(options.projectSkillsDir, byName, diagnostics);
  }

  return { skills: [...byName.values()], diagnostics };
}

function collectSkillsFromDir(dir: string, byName: Map<string, Skill>, diagnostics: SkillDiagnostic[]): void {
  if (!existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    diagnostics.push({ path: dir, message: `cannot read skills directory: ${(error as Error).message}` });
    return;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (!isDirectory(entryPath)) continue;
    const filePath = join(entryPath, SKILL_FILE);
    if (!existsSync(filePath)) continue;
    const skill = parseSkillFile(entry.name, entryPath, filePath, diagnostics);
    if (skill !== null) byName.set(skill.name, skill);
  }
}

function parseSkillFile(
  dirName: string,
  baseDir: string,
  filePath: string,
  diagnostics: SkillDiagnostic[],
): Skill | null {
  const nameError = validateName(dirName);
  if (nameError !== null) {
    diagnostics.push({ path: filePath, message: nameError });
    return null;
  }

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = readFrontmatter(filePath);
  } catch (error) {
    diagnostics.push({ path: filePath, message: `invalid frontmatter: ${(error as Error).message}` });
    return null;
  }

  if (frontmatter.name !== undefined && frontmatter.name !== dirName) {
    diagnostics.push({
      path: filePath,
      message: `skill name '${String(frontmatter.name)}' must match the directory name '${dirName}'`,
    });
    return null;
  }

  const descriptionError = validateDescription(frontmatter.description);
  if (descriptionError !== null) {
    diagnostics.push({ path: filePath, message: descriptionError });
    return null;
  }

  return { name: dirName, description: frontmatter.description as string, filePath, baseDir };
}

function readFrontmatter(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) return {};
  const parsed = parseYaml(lines.slice(1, closingIndex).join("\n"));
  if (parsed === null || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
