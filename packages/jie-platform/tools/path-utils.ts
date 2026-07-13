import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";

export function resolveWithinWorkspace(
  path: string,
  workspaceRoot: string,
): string {
  const abs = isAbsolute(path) ? path : resolve(workspaceRoot, path);
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    real = abs;
  }
  let rootReal: string;
  try {
    rootReal = realpathSync(workspaceRoot);
  } catch {
    rootReal = workspaceRoot;
  }
  if (real !== rootReal && !real.startsWith(rootReal + "/")) {
    throw new JiePlatformError("PATH_ESCAPE", { detail: path });
  }
  return real;
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
