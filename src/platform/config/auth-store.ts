import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthEntry, AuthJson } from "./types";

export interface AuthStore {
  load(): AuthJson;
  setProvider(provider: string, key: string): void;
  removeProvider(provider: string): void;
  clear(): void;
}

export class AuthStoreImpl implements AuthStore {
  constructor(private readonly homeJieDir: string) {}

  load(): AuthJson {
    try {
      return loadAuthJson(this.homeJieDir);
    } catch {
      return {};
    }
  }

  setProvider(provider: string, key: string): void {
    const entry: AuthEntry = { type: "api_key", key };
    saveAuthJson(this.homeJieDir, { ...this.load(), [provider]: entry });
  }

  removeProvider(provider: string): void {
    const next: AuthJson = { ...this.load() };
    delete next[provider];
    saveAuthJson(this.homeJieDir, next);
  }

  clear(): void {
    saveAuthJson(this.homeJieDir, {});
  }
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
  const parsed: AuthJson = JSON.parse(text);
  return parsed;
}

function saveAuthJson(homeJieDir: string, auth: AuthJson): void {
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const path = join(homeJieDir, "auth.json");
  writeFileSync(path, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
  chmodSync(path, 0o600);
}
