import { readFileSync } from "node:fs";
import type { AuthJson } from "./types.ts";
import { globalAuthPath } from "./paths.ts";

/** Reads `~/.jie/auth.json` and returns the typed shape. Missing file
 *  returns `{}`. The platform does not validate the inner shape —
 *  `auth.json`'s schema is owned by `@earendil-works/pi-ai`'s
 *  `FileAuthStorageBackend`, which refuses malformed entries at the
 *  provider-call boundary. */
export function loadAuthJson(options: { homeDir: string }): AuthJson {
  const path = globalAuthPath(options.homeDir);
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  return JSON.parse(text) as AuthJson;
}