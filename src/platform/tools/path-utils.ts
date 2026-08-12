import { readdirSync, realpathSync, type Dirent } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";

export const DEFAULT_IGNORE_DIRS = ["node_modules", ".git"] as const;

export function resolveWithinWorkspace(
  path: string,
  workspaceRoot: string,
): { readonly realPath: string; readonly relativePath: string } {
  const abs = isAbsolute(path) ? path : resolve(workspaceRoot, path);
  const real = realpathOfDeepestExisting(abs);
  let rootReal: string;
  try {
    rootReal = realpathSync(workspaceRoot);
  } catch {
    rootReal = workspaceRoot;
  }
  if (real !== rootReal && !real.startsWith(rootReal + "/")) {
    throw new JiePlatformError("PATH_ESCAPE", { detail: path });
  }
  return { realPath: real, relativePath: relative(rootReal, real) };
}

export function mapErrno(
  error: unknown,
  errorMap: Record<string, string>,
): Error {
  const errno = error as NodeJS.ErrnoException;
  if (errno && typeof errno.code === "string") {
    const code = errorMap[errno.code];
    if (code !== undefined) {
      return new JiePlatformError(
        code as JiePlatformErrorCode,
        { detail: errno.message, cause: errno },
      );
    }
  }
  return errno instanceof Error ? errno : new Error(String(error));
}

export function* walkFiles(
  root: string,
  signal: AbortSignal | undefined,
  ignoreDirs: ReadonlyArray<string> = DEFAULT_IGNORE_DIRS,
): IterableIterator<string> {
  const stack: string[] = [""];
  while (stack.length > 0) {
    if (signal?.aborted) return;
    const dir = stack.pop();
    if (dir === undefined) return;
    const absDir = dir === "" ? root : join(root, dir);
    let entries: Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (signal?.aborted) return;
      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) continue;
        stack.push(dir === "" ? entry.name : `${dir}/${entry.name}`);
      } else if (entry.isFile()) {
        yield dir === "" ? entry.name : `${dir}/${entry.name}`;
      }
    }
  }
}

function realpathOfDeepestExisting(abs: string): string {
  const tail: string[] = [];
  let current = abs;
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length === 0 ? real : join(real, ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) return abs;
      tail.unshift(basename(current));
      current = parent;
    }
  }
}
