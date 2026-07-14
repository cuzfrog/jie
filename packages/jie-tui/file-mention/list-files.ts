import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "out", "coverage", ".cache"]);
const MAX_DEPTH = 6;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_048_576;
const GITIGNORE_FILE = ".gitignore";
const REGEX_META = new Set([".", "(", ")", "+", "|", "^", "$", "{", "}"]);

export interface ScannedFile {
  readonly absPath: string;
  readonly relPath: string;
}

export function scanFiles(rootDir: string): ReadonlyArray<ScannedFile> {
  if (!existsSync(rootDir)) return [];
  const rootIgnores = readGitignore(rootDir, ".");
  const out: ScannedFile[] = [];
  const stack: Array<{ readonly dir: string; readonly relDir: string; readonly depth: number; readonly ignores: IgnoreSet }> = [
    { dir: rootDir, relDir: ".", depth: 0, ignores: rootIgnores },
  ];
  while (stack.length > 0 && out.length < MAX_FILES) {
    const next = stack.pop();
    if (next === undefined) break;
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
        if (isIgnored(relEntry, next.ignores, next.relDir, true)) continue;
        const childIgnores = composeIgnores(next.ignores, readGitignore(abs, relEntry));
        stack.push({ dir: abs, relDir: relEntry, depth: next.depth + 1, ignores: childIgnores });
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_FILE_BYTES) continue;
      if (isIgnored(relEntry, next.ignores, next.relDir, false)) continue;
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
  readonly fromRelDir: string;
}

interface IgnoreSet {
  readonly patterns: ReadonlyArray<IgnorePattern>;
}

function readGitignore(dir: string, fromRelDir: string): IgnoreSet {
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
    if (trimmed === "") continue;
    const regex = compilePattern(trimmed, anchored, dirOnly);
    if (regex === null) continue;
    patterns.push({ anchored, dirOnly, negate, regex, fromRelDir });
  }
  return { patterns };
}

function composeIgnores(parent: IgnoreSet, child: IgnoreSet): IgnoreSet {
  return { patterns: [...parent.patterns, ...child.patterns] };
}

function compilePattern(pattern: string, anchored: boolean, dirOnly: boolean): RegExp | null {
  const body = globToRegex(pattern);
  const tail = dirOnly ? "/?$" : "$";
  const full = anchored ? `^${body}${tail}` : `^(?:[^/]+/)*${body}${tail}`;
  try {
    return new RegExp(full);
  } catch {
    return null;
  }
}

function globToRegex(pattern: string): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 3;
          continue;
        }
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
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next !== undefined) {
        if (REGEX_META.has(next) || next === "*" || next === "?" || next === "[" || next === "]") {
          out += `\\${next}`;
        } else {
          out += next;
        }
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        out += "\\[";
        i += 1;
        continue;
      }
      let classBody = pattern.slice(i + 1, end);
      if (classBody.startsWith("!") || classBody.startsWith("^")) {
        classBody = "^" + classBody.slice(1);
      }
      out += "[" + escapeClassBody(classBody) + "]";
      i = end + 1;
      continue;
    }
    if (REGEX_META.has(ch)) {
      out += `\\${ch}`;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function escapeClassBody(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch === "\\" || ch === "]" || ch === "[") {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function isIgnored(relPath: string, ignores: IgnoreSet, frameRelDir: string, isDir: boolean): boolean {
  let ignored = false;
  for (const p of ignores.patterns) {
    if (!isInScope(p.fromRelDir, frameRelDir)) continue;
    if (p.dirOnly && !isDir) continue;
    const sub = p.fromRelDir === "." ? relPath : relPath.slice(p.fromRelDir.length + 1);
    const target = p.dirOnly && isDir ? sub + "/" : sub;
    if (p.regex.test(target)) {
      ignored = !p.negate;
    }
  }
  return ignored;
}

function isInScope(fromRelDir: string, frameRelDir: string): boolean {
  if (fromRelDir === ".") return true;
  if (frameRelDir === fromRelDir) return true;
  return frameRelDir.startsWith(fromRelDir + "/");
}
