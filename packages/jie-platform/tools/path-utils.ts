import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { JiePlatformError } from "../domain-types.ts";

/** Resolve `path` against `workspaceRoot` and enforce workspace-root
 *  containment. Throws `JiePlatformError` with code `path_escape` on
 *  violation. The check uses realpath to defeat symlink-based
 *  escape; the resolved absolute path must equal or start with the
 *  resolved absolute workspace root. */
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

/** Map a Node `ErrnoException` to a JiePlatformError. `errorMap`
 *  maps errno codes to platform error codes. Returns the thrown
 *  error so callers can re-throw. */
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