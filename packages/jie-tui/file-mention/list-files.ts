import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "out", "coverage", ".cache"]);
const MAX_DEPTH = 6;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_048_576;

export interface ScannedFile {
  readonly absPath: string;
  readonly relPath: string;
}

export function scanFiles(rootDir: string): ReadonlyArray<ScannedFile> {
  const out: ScannedFile[] = [];
  const stack: Array<{ readonly dir: string; readonly depth: number }> = [{ dir: rootDir, depth: 0 }];
  while (stack.length > 0 && out.length < MAX_FILES) {
    const next = stack.pop();
    if (next === undefined) break;
    const entries = safeReaddir(next.dir);
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break;
      if (entry.startsWith(".")) continue;
      const abs = join(next.dir, entry);
      let stat;
      try {
        stat = lstatSync(abs);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (!stat.isFile()) {
        if (stat.isDirectory() && !SKIP_DIRS.has(entry) && next.depth < MAX_DEPTH) {
          stack.push({ dir: abs, depth: next.depth + 1 });
        }
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) continue;
      out.push({ absPath: abs, relPath: toRel(rootDir, abs) });
    }
  }
  return out;
}

function safeReaddir(dir: string): ReadonlyArray<string> {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function toRel(root: string, abs: string): string {
  if (abs.startsWith(root + "/")) return abs.slice(root.length + 1);
  return abs;
}
