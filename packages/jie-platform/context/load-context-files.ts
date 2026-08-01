import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContextFile, LoadContextFilesOptions } from "./types";

const CONTEXT_FILE_NAMES = ["AGENTS.md", "CLAUDE.md"] as const;

export function loadContextFiles(options: LoadContextFilesOptions): ContextFile[] {
  const files: ContextFile[] = [];
  const seen = new Set<string>();
  collectDir(options.homeJieDir, files, seen);
  const ancestors = ancestorDirs(options.cwd);
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    collectDir(ancestors[i], files, seen);
  }
  return files;
}

function collectDir(dir: string, files: ContextFile[], seen: Set<string>): void {
  for (const name of CONTEXT_FILE_NAMES) {
    const path = join(dir, name);
    if (seen.has(path) || !existsSync(path)) continue;
    let content: string;
    try {
      content = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    seen.add(path);
    files.push({ path, content });
  }
}

function ancestorDirs(startDir: string): string[] {
  const dirs: string[] = [];
  let current = startDir;
  for (;;) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) return dirs;
    current = parent;
  }
}
