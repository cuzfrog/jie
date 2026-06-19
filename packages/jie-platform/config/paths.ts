import { existsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { dirname, join } from "node:path";

/** Global user Jie dir (`~/.jie/`). */
export function homeJieDir(homeDir: string = osHomedir()): string {
  return join(homeDir, ".jie");
}

/** Path to `~/.jie/settings.json`. */
export function globalSettingsPath(homeDir: string = osHomedir()): string {
  return join(homeJieDir(homeDir), "settings.json");
}

/** Path to `~/.jie/auth.json`. */
export function globalAuthPath(homeDir: string = osHomedir()): string {
  return join(homeJieDir(homeDir), "auth.json");
}

/** Walks up from `cwd` looking for a `.jie/` directory. Returns the
 *  directory containing `.jie/` or `null` if none is found before the
 *  filesystem root. */
export function findProjectJieRoot(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    const candidate = join(current, ".jie");
    if (existsSync(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Path to `.jie/settings.json` under the discovered project root, or
 *  `null` if no `.jie/` is found walking up from `cwd`. */
export function projectSettingsPath(cwd: string): string | null {
  const root = findProjectJieRoot(cwd);
  if (root === null) return null;
  return join(root, ".jie", "settings.json");
}