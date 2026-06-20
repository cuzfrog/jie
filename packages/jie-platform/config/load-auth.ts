import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthJson } from "./types.ts";

export function loadAuthJson(homeJieDir: string): AuthJson {
  const path = join(homeJieDir, "auth.json");
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  return JSON.parse(text) as AuthJson;
}