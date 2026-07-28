import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BLUEPRINT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function listBlueprints(sourceDir: string = defaultBlueprintsDir()): string[] {
  let entries: string[];
  try {
    entries = readdirSync(sourceDir);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    if (!existsSync(join(sourceDir, entry, "TEAM.md"))) continue;
    ids.push(entry);
  }
  return ids;
}

export function installBlueprint(
  blueprintId: string,
  targetJieDir: string,
  sourceDir: string = defaultBlueprintsDir(),
): string {
  if (!BLUEPRINT_ID_PATTERN.test(blueprintId)) {
    throw new Error(`invalid blueprint id: ${blueprintId}`);
  }
  const blueprintDir = join(sourceDir, blueprintId);
  if (!existsSync(join(blueprintDir, "TEAM.md"))) {
    throw new Error(`blueprint '${blueprintId}' not found in ${sourceDir}`);
  }
  const targetTeamDir = join(targetJieDir, "teams", blueprintId);
  if (existsSync(targetTeamDir)) {
    throw new Error(`team '${blueprintId}' already installed at ${targetTeamDir}`);
  }
  mkdirSync(targetTeamDir, { recursive: true });
  for (const entry of readdirSync(blueprintDir).sort()) {
    if (!entry.endsWith(".md")) continue;
    const sourcePath = join(blueprintDir, entry);
    if (!statSync(sourcePath).isFile()) continue;
    writeFileSync(join(targetTeamDir, entry), readFileSync(sourcePath, "utf-8"), "utf-8");
  }
  return targetTeamDir;
}

function defaultBlueprintsDir(): string {
  return import.meta.dir;
}
