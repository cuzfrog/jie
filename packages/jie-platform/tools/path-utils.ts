import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { JiePlatformError } from "../domain-types.ts";

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
    throw new JiePlatformError(
      "path_escape",
      `path_escape: ${path}`,
    );
  }
  return real;
}

export function mapErrno(
  e: unknown,
  errorMap: Record<string, string>,
): Error {
  const err = e as NodeJS.ErrnoException;
  if (err && typeof err.code === "string") {
    const code = errorMap[err.code];
    if (code !== undefined) {
      return new JiePlatformError(code, `${code}: ${err.message}`);
    }
  }
  return err instanceof Error ? err : new Error(String(e));
}