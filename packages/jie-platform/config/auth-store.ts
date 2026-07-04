
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthJson } from "./types";

export interface AuthStore {
  load(): AuthJson;
  saveAuthConfig(auth: AuthJson): void;
  setProvider(auth: AuthJson, provider: string, key: string): AuthJson;
  removeProvider(auth: AuthJson, provider: string): AuthJson;
  clear(): AuthJson;
}

export function makeAuthStore(homeJieDir: string): AuthStore {
  return {
    load(): AuthJson {
      try {
        return loadAuthJson(homeJieDir);
      } catch {
        return {};
      }
    },
    saveAuthConfig(auth: AuthJson): void {
      mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
      const path = join(homeJieDir, "auth.json");
      writeFileSync(path, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
      chmodSync(path, 0o600);
    },
    setProvider(auth, provider, key) {
      return { ...auth, [provider]: { type: "api_key", key } };
    },
    removeProvider(auth, provider) {
      const next: AuthJson = { ...auth };
      delete next[provider];
      return next;
    },
    clear(): AuthJson {
      return {};
    },
  };
}

function loadAuthJson(homeJieDir: string): AuthJson {
  const path = join(homeJieDir, "auth.json");
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return JSON.parse(text) as AuthJson;
}
