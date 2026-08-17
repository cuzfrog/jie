import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { isErrnoException } from "..";
import type { AuthJson } from "./types";

export interface AuthStore extends CredentialStore {
  load(): AuthJson;
  setProvider(provider: string, key: string): void;
  removeProvider(provider: string): void;
  clear(): void;
}

export class AuthStoreImpl implements AuthStore {
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly homeJieDir: string) {}

  load(): AuthJson {
    try {
      return loadAuthJson(this.homeJieDir);
    } catch {
      return {};
    }
  }

  setProvider(provider: string, key: string): void {
    saveAuthJson(this.homeJieDir, { ...this.load(), [provider]: { type: "api_key", key } });
  }

  removeProvider(provider: string): void {
    const next = { ...this.load() };
    delete next[provider];
    saveAuthJson(this.homeJieDir, next);
  }

  clear(): void {
    saveAuthJson(this.homeJieDir, {});
  }

  async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    return this.load()[providerId];
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    return Object.entries(this.load()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
  }

  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>, options?: AuthOperationOptions): Promise<Credential | undefined> {
    const task = this.writeChain.then(async (): Promise<Credential | undefined> => {
      options?.signal?.throwIfAborted();
      const current = this.load()[providerId];
      const next = await fn(current);
      options?.signal?.throwIfAborted();
      if (next === undefined) return current;
      saveAuthJson(this.homeJieDir, { ...this.load(), [providerId]: next });
      return next;
    });
    this.writeChain = task.catch(() => {});
    return task;
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    const task = this.writeChain.then((): void => {
      options?.signal?.throwIfAborted();
      const auth = this.load();
      if (auth[providerId] === undefined) return;
      delete auth[providerId];
      saveAuthJson(this.homeJieDir, auth);
    });
    this.writeChain = task.catch(() => {});
    return task;
  }
}

function loadAuthJson(homeJieDir: string): AuthJson {
  const path = join(homeJieDir, "auth.json");
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return {};
    throw error;
  }
  const parsed = JSON.parse(text);
  return parsed as AuthJson;
}

function saveAuthJson(homeJieDir: string, auth: AuthJson): void {
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const path = join(homeJieDir, "auth.json");
  writeFileSync(path, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
  chmodSync(path, 0o600);
}
