import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";

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
