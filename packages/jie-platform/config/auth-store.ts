
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { globalAuthPath, homeJieDir } from "./paths.ts";
import { loadAuthJson } from "./load-auth.ts";
import type { AuthJson } from "./types.ts";

export interface AuthStore {
  load(): AuthJson;
  write(auth: AuthJson): void;
  setProvider(auth: AuthJson, provider: string, key: string): AuthJson;
  removeProvider(auth: AuthJson, provider: string): AuthJson;
  clear(): AuthJson;
}

export function makeAuthStore(homeDir: string): AuthStore {
  return {
    load(): AuthJson {
      try {
        return loadAuthJson({ homeDir });
      } catch {
        return {};
      }
    },
    write(auth: AuthJson): void {
      mkdirSync(homeJieDir(homeDir), { recursive: true, mode: 0o755 });
      const path = globalAuthPath(homeDir);
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