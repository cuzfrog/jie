import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "out", "coverage", ".cache"]);
const MAX_DEPTH = 6;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_048_576;
const GITIGNORE_FILE = ".gitignore";

export interface ScannedFile {
  readonly absPath: string;
  readonly relPath: string;
}

export function scanFiles(rootDir: string): ReadonlyArray<ScannedFile> {
  if (!existsSync(rootDir)) return [];
  const rootIgnores = readGitignore(rootDir, ".");
  const out: ScannedFile[] = [];
  const stack: Array<{ readonly dir: string; readonly relDir: string; readonly depth: number }> = [
    { dir: rootDir, relDir: ".", depth: 0 },
  ];
  while (stack.length > 0 && out.length < MAX_FILES) {
    const next = stack.pop();
    if (next === undefined) break;
    const dirIgnores = next.relDir === "." ? rootIgnores : composeIgnores(rootIgnores, readGitignore(next.dir, next.relDir));
    const entries = safeReaddir(next.dir);
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break;
      if (entry.startsWith(".")) continue;
      const abs = join(next.dir, entry);
      const relEntry = next.relDir === "." ? entry : `${next.relDir}/${entry}`;
      let stat;
      try {
        stat = lstatSync(abs);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        if (next.depth >= MAX_DEPTH) continue;
        if (isIgnored(relEntry + "/", dirIgnores, true)) continue;
        stack.push({ dir: abs, relDir: relEntry, depth: next.depth + 1 });
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_FILE_BYTES) continue;
      if (isIgnored(relEntry, dirIgnores, false)) continue;
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
  if (abs.startsWith(root + sep) || abs.startsWith(root + "/")) return abs.slice(root.length + 1);
  return abs;
}

interface IgnorePattern {
  readonly anchored: boolean;
  readonly dirOnly: boolean;
  readonly negate: boolean;
  readonly regex: RegExp;
}

interface IgnoreSet {
  readonly patterns: ReadonlyArray<IgnorePattern>;
}

function readGitignore(dir: string, relDir: string): IgnoreSet {
  const gitignorePath = join(dir, GITIGNORE_FILE);
  let raw: string;
  try {
    raw = readFileSync(gitignorePath, "utf8");
  } catch {
    return { patterns: [] };
  }
  const patterns: IgnorePattern[] = [];
  for (const line of raw.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    let negate = false;
    if (trimmed.startsWith("!")) {
      negate = true;
      trimmed = trimmed.slice(1).trim();
    }
    let dirOnly = false;
    if (trimmed.endsWith("/")) {
      dirOnly = true;
      trimmed = trimmed.slice(0, -1);
    }
    let anchored = false;
    if (trimmed.startsWith("/")) {
      anchored = true;
      trimmed = trimmed.slice(1);
    }
    const prefix = relDir === "." ? "" : `${relDir}/`;
    const regex = compilePattern(trimmed, anchored, prefix);
    patterns.push({ anchored, dirOnly, negate, regex });
  }
  return { patterns };
}

function composeIgnores(parent: IgnoreSet, child: IgnoreSet): IgnoreSet {
  return { patterns: [...parent.patterns, ...child.patterns] };
}

function compilePattern(pattern: string, anchored: boolean, prefix: string): RegExp {
  let body = globToRegex(pattern);
  const full = anchored ? `^${escapeForRel(prefix)}${body}(?:/.*)?$` : `^(?:[^/]+/)*${escapeForRel(prefix)}${body}(?:/.*)?$`;
  return new RegExp(full);
}

function globToRegex(pattern: string): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if (ch === "." || ch === "(" || ch === ")" || ch === "+" || ch === "|" || ch === "^" || ch === "$" || ch === "{" || ch === "}" || ch === "\\") {
      out += `\\${ch}`;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function escapeForRel(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isIgnored(relPath: string, ignores: IgnoreSet, isDir: boolean): boolean {
  let ignored = false;
  for (const p of ignores.patterns) {
    if (p.dirOnly && !isDir) continue;
    if (p.regex.test(relPath)) {
      ignored = !p.negate;
    }
  }
  return ignored;
}