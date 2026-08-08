import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSkill } from "./parse-skill";
import type { LoadSkillsResult, Skill, SkillDiagnostic } from "./types";

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
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({ path: dir, message: `cannot read skills directory: ${message}` });
    return;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (!isDirectory(entryPath)) continue;
    const filePath = join(entryPath, SKILL_FILE);
    if (!existsSync(filePath)) continue;
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({ path: filePath, message: `cannot read skill file: ${message}` });
      continue;
    }
    const { skill, diagnostic } = parseSkill({ dirName: entry.name, baseDir: entryPath, filePath, content });
    if (diagnostic !== null) diagnostics.push({ path: filePath, message: diagnostic });
    if (skill !== null) byName.set(skill.name, skill);
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
