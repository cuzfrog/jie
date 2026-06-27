
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UMBRELLA_NAME = "@cuzfrog/jie";
const FALLBACK_VERSION = "0.0.0-dev";
const MAX_WALK_DEPTH = 10;

interface PkgJson {
  name?: string;
  version?: string;
}

export function resolveVersion(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    try {
      const text = readFileSync(join(dir, "package.json"), "utf-8");
      const pkg = JSON.parse(text) as PkgJson;
      if (pkg.name === UMBRELLA_NAME && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir) return FALLBACK_VERSION;
    dir = parent;
  }
  return FALLBACK_VERSION;
}

export const VERSION: string = resolveVersion(dirname(fileURLToPath(import.meta.url)));
