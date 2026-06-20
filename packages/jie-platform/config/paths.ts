import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function homeJieDir(homeDir: string): string {
  return join(homeDir, ".jie");
}

export function globalSettingsPath(homeDir: string): string {
  return join(homeJieDir(homeDir), "settings.json");
}

export function globalAuthPath(homeDir: string): string {
  return join(homeJieDir(homeDir), "auth.json");
}

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

export function projectSettingsPath(cwd: string): string | null {
  const root = findProjectJieRoot(cwd);
  if (root === null) return null;
  return join(root, ".jie", "settings.json");
}