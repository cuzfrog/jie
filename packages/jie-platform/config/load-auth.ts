import { readFileSync } from "node:fs";
import type { AuthJson } from "./types.ts";
import { globalAuthPath } from "./paths.ts";

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