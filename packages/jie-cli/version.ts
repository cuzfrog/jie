/**
 * Resolve the umbrella `@cuzfrog/jie` package version at runtime by
 * walking up from `import.meta.dirname`. The umbrella `package.json`
 * has no fixed path: in dev (monorepo layout) it sits at
 * `../../package.json`; after `bun install -g` (Day 2 publish) the
 * tree is flattened and the relative path breaks. Walking up
 * from the CLI's directory handles both layouts.
 *
 * Resolution algorithm:
 *   1. Start at `import.meta.dirname`.
 *   2. Walk up the parent chain.
 *   3. At each level, try to read `package.json`.
 *   4. Return the first whose `name` equals `"@cuzfrog/jie"`.
 *   5. Fallback `"0.0.0-dev"` if no matching `package.json` is found.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UMBRELLA_NAME = "@cuzfrog/jie";
const FALLBACK_VERSION = "0.0.0-dev";

interface PkgJson {
  name?: string;
  version?: string;
}

export function resolveVersion(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      const text = readFileSync(join(dir, "package.json"), "utf-8");
      const pkg = JSON.parse(text) as PkgJson;
      if (pkg.name === UMBRELLA_NAME && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // No `package.json` at this level, or unreadable — keep walking.
    }
    const parent = dirname(dir);
    if (parent === dir) return FALLBACK_VERSION;
    dir = parent;
  }
}

export const VERSION: string = resolveVersion(dirname(fileURLToPath(import.meta.url)));
